using System.ComponentModel.DataAnnotations;

namespace LojinhaCorsa.API.Contracts;

public sealed record CategoryRequest([Required, MaxLength(120)] string Name,
    [Required, MaxLength(140)] string Slug, string? Description, bool IsActive = true);

public sealed record ProductRequest(Guid? CategoryId, [Required, MaxLength(180)] string Name,
    [Required, MaxLength(200)] string Slug, string? Description,
    [Range(0, 9999999999.99)] decimal BasePrice, bool IsAvailable = true);

public sealed record AttributeDefinitionRequest([Required, MaxLength(80)] string Name,
    [Required, MaxLength(80)] string Code, int SortOrder = 0, bool IsRequired = true,
    IReadOnlyList<string>? Values = null);

public sealed record VariationRequest([Required, MaxLength(255)] string DisplayName,
    [MaxLength(80)] string? Sku, decimal? PriceOverride, bool IsAvailable,
    [Required] IReadOnlyList<Guid> AttributeValueIds);

public sealed record QuantityDiscountRequest(
    [Range(2, 1000)] int MinimumQuantity,
    [Range(typeof(decimal), "0.01", "9999999999.99")] decimal DiscountPerUnit);
