using System.Security.Cryptography;

namespace LojinhaCorsa.API.Services;

public sealed record StoredFile(string StorageKey, string OriginalName, string MimeType, long Size, string Sha256);

public interface IFileStorage
{
    Task<StoredFile> SaveReceiptAsync(IFormFile file, CancellationToken ct);
    Task<StoredFile> SaveProductImageAsync(IFormFile file, CancellationToken ct);
    string GetAbsolutePath(string storageKey);
}

public sealed class LocalFileStorage(IWebHostEnvironment environment, IConfiguration configuration) : IFileStorage
{
    private static readonly HashSet<string> ImageTypes = ["image/jpeg", "image/png", "image/webp"];
    private static readonly HashSet<string> ReceiptTypes = [.. ImageTypes, "application/pdf"];
    private readonly string _root = Path.GetFullPath(Path.Combine(environment.ContentRootPath,
        configuration["Uploads:RootPath"] ?? "uploads"));
    private readonly long _maxReceipt = configuration.GetValue("Uploads:MaxReceiptBytes", 10_485_760L);
    private readonly long _maxImage = configuration.GetValue("Uploads:MaxProductImageBytes", 5_242_880L);

    public Task<StoredFile> SaveReceiptAsync(IFormFile file, CancellationToken ct) =>
        SaveAsync(file, "receipts", ReceiptTypes, _maxReceipt, ct);

    public Task<StoredFile> SaveProductImageAsync(IFormFile file, CancellationToken ct) =>
        SaveAsync(file, "products", ImageTypes, _maxImage, ct);

    public string GetAbsolutePath(string storageKey)
    {
        var path = Path.GetFullPath(Path.Combine(_root, storageKey.Replace('/', Path.DirectorySeparatorChar)));
        if (!path.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Caminho de arquivo inválido.");
        return path;
    }

    private async Task<StoredFile> SaveAsync(IFormFile file, string folder, HashSet<string> allowedTypes,
        long maxBytes, CancellationToken ct)
    {
        if (file.Length <= 0)
            throw new Infrastructure.AppException(400, "O arquivo enviado está vazio.");
        if (file.Length > maxBytes)
            throw new Infrastructure.AppException(400, $"A imagem selecionada excede o limite máximo permitido de {maxBytes / (1024 * 1024)} MB.");
        if (!allowedTypes.Contains(file.ContentType.ToLowerInvariant()))
            throw new Infrastructure.AppException(400, "Formato de arquivo não suportado. Por favor, envie uma imagem nos formatos JPG, PNG ou WebP.");

        var extension = file.ContentType.ToLowerInvariant() switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            "application/pdf" => ".pdf",
            _ => throw new Infrastructure.AppException(400, "Formato de imagem não permitido. Envie JPG, PNG ou WebP.")
        };
        var storageKey = $"{folder}/{DateTime.UtcNow:yyyy/MM}/{Guid.NewGuid():N}{extension}";
        var absolutePath = GetAbsolutePath(storageKey);
        Directory.CreateDirectory(Path.GetDirectoryName(absolutePath)!);

        await using var input = file.OpenReadStream();
        await using var output = new FileStream(absolutePath, FileMode.CreateNew, FileAccess.Write,
            FileShare.None, 81920, FileOptions.Asynchronous);
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = new byte[81920];
        int read;
        while ((read = await input.ReadAsync(buffer, ct)) > 0)
        {
            hash.AppendData(buffer, 0, read);
            await output.WriteAsync(buffer.AsMemory(0, read), ct);
        }
        await output.FlushAsync(ct);
        output.Close();
        if (!HasValidSignature(absolutePath, file.ContentType))
        {
            File.Delete(absolutePath);
            throw new Infrastructure.AppException(400, "O conteúdo do arquivo não corresponde ao tipo informado.");
        }
        return new StoredFile(storageKey, Path.GetFileName(file.FileName), file.ContentType,
            file.Length, Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant());
    }

    private static bool HasValidSignature(string path, string contentType)
    {
        Span<byte> header = stackalloc byte[12];
        using var stream = File.OpenRead(path);
        var length = stream.Read(header);
        return contentType.ToLowerInvariant() switch
        {
            "image/jpeg" => length >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
            "image/png" => length >= 8 && header[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            "image/webp" => length >= 12 && header[..4].SequenceEqual("RIFF"u8) && header[8..12].SequenceEqual("WEBP"u8),
            "application/pdf" => length >= 5 && header[..5].SequenceEqual("%PDF-"u8),
            _ => false
        };
    }
}
