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
    private readonly string _root = ResolveUploadsRoot(environment, configuration);
    private readonly long _maxReceipt = configuration.GetValue("Uploads:MaxReceiptBytes", 10_485_760L);
    private readonly long _maxImage = configuration.GetValue("Uploads:MaxProductImageBytes", 5_242_880L);

    private static string ResolveUploadsRoot(IWebHostEnvironment environment, IConfiguration configuration)
    {
        var configured = configuration["Uploads:RootPath"];
        string path;
        if (!string.IsNullOrWhiteSpace(configured) && Path.IsPathRooted(configured))
        {
            path = Path.GetFullPath(configured);
        }
        else
        {
            path = Path.GetFullPath(Path.Combine(environment.ContentRootPath, configured ?? "uploads"));
        }

        try
        {
            Directory.CreateDirectory(path);
            return path;
        }
        catch
        {
            var fallback = Path.Combine(Path.GetTempPath(), "lojinha_uploads");
            Directory.CreateDirectory(fallback);
            return fallback;
        }
    }

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

    private static string NormalizeMimeType(string contentType)
    {
        return contentType.ToLowerInvariant().Trim() switch
        {
            "image/x-png" => "image/png",
            "image/pjpeg" => "image/jpeg",
            "image/jpg" => "image/jpeg",
            _ => contentType.ToLowerInvariant().Trim()
        };
    }

    private static string InferMimeType(IFormFile file)
    {
        var contentType = file.ContentType?.Trim();
        if (!string.IsNullOrEmpty(contentType) && contentType != "application/octet-stream")
            return NormalizeMimeType(contentType);

        var extension = Path.GetExtension(file.FileName)?.ToLowerInvariant();
        return extension switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".pdf" => "application/pdf",
            _ => contentType ?? ""
        };
    }

    private async Task<StoredFile> SaveAsync(IFormFile file, string folder, HashSet<string> allowedTypes,
        long maxBytes, CancellationToken ct)
    {
        if (file.Length <= 0)
            throw new Infrastructure.AppException(400, "O arquivo enviado está vazio.");
        if (file.Length > maxBytes)
            throw new Infrastructure.AppException(400, $"O arquivo excede o limite máximo de {maxBytes / (1024 * 1024)} MB.");

        var effectiveMime = InferMimeType(file);
        if (!allowedTypes.Contains(effectiveMime))
        {
            var accepted = allowedTypes.Contains("application/pdf")
                ? "JPG, PNG, WebP ou PDF"
                : "JPG, PNG ou WebP";
            throw new Infrastructure.AppException(400, $"Formato de arquivo não suportado. Envie nos formatos: {accepted}.");
        }

        var extension = effectiveMime switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            "application/pdf" => ".pdf",
            _ => throw new Infrastructure.AppException(400, "Formato não permitido.")
        };

        // Validate magic bytes before writing to disk
        await using var input = file.OpenReadStream();
        var header = new byte[12];
        var headerLength = await input.ReadAsync(header.AsMemory(0, 12), ct);
        if (!IsValidSignature(header.AsSpan(0, headerLength), effectiveMime))
            throw new Infrastructure.AppException(400, "O conteúdo do arquivo não corresponde ao formato informado. Verifique se o arquivo não está corrompido.");

        if (input.CanSeek)
        {
            input.Position = 0;
        }

        var storageKey = $"{folder}/{DateTime.UtcNow:yyyy/MM}/{Guid.NewGuid():N}{extension}";
        var absolutePath = GetAbsolutePath(storageKey);
        Directory.CreateDirectory(Path.GetDirectoryName(absolutePath)!);

        await using var output = new FileStream(absolutePath, FileMode.CreateNew, FileAccess.Write,
            FileShare.None, 81920, FileOptions.Asynchronous);
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);

        // If stream couldn't be rewound, write the header bytes already read
        if (!input.CanSeek)
        {
            hash.AppendData(header, 0, headerLength);
            await output.WriteAsync(header.AsMemory(0, headerLength), ct);
        }

        // Stream the rest
        var buffer = new byte[81920];
        int read;
        while ((read = await input.ReadAsync(buffer, ct)) > 0)
        {
            hash.AppendData(buffer, 0, read);
            await output.WriteAsync(buffer.AsMemory(0, read), ct);
        }
        await output.FlushAsync(ct);

        return new StoredFile(storageKey, Path.GetFileName(file.FileName), effectiveMime,
            file.Length, Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant());
    }

    private static bool IsValidSignature(ReadOnlySpan<byte> header, string contentType)
    {
        return contentType switch
        {
            "image/jpeg" => header.Length >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
            "image/png" => header.Length >= 8 && header[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            "image/webp" => header.Length >= 12 && header[..4].SequenceEqual("RIFF"u8) && header[8..12].SequenceEqual("WEBP"u8),
            "application/pdf" => header.Length >= 5 && header[..5].SequenceEqual("%PDF-"u8),
            _ => false
        };
    }
}
