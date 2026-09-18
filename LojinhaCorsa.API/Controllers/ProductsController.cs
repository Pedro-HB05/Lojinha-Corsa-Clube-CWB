using LojinhaCorsa.API.Contracts;
using LojinhaCorsa.API.Data;
using LojinhaCorsa.API.Domain;
using LojinhaCorsa.API.Infrastructure;
using LojinhaCorsa.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LojinhaCorsa.API.Controllers;

[ApiController, Route("api"), Route("")]
public sealed class ProductsController(AppDbContext db, ICurrentUser currentUser,
    IAuditService audit, IFileStorage files) : ControllerBase
{
    [AllowAnonymous, HttpGet("products")]
    public async Task<IActionResult> ListProducts([FromQuery] string? search, [FromQuery] Guid? categoryId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        (page, pageSize) = Paging.Normalize(page, pageSize);
        var query = db.Products.AsNoTracking().Where(x => x.IsAvailable);
        if (categoryId.HasValue) query = query.Where(x => x.CategoryId == categoryId);
        if (!string.IsNullOrWhiteSpace(search)) query = query.Where(x => EF.Functions.ILike(x.Name, $"%{search.Trim()}%"));
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Name).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.Id, x.Name, x.Slug, x.Description, x.BasePrice, x.CategoryId,
                Discounts = x.QuantityDiscounts.OrderBy(d => d.MinimumQuantity)
                    .Select(d => new { d.Id, d.MinimumQuantity, d.DiscountPerUnit }),
                photo = x.Photos.OrderByDescending(p => p.IsPrimary).ThenBy(p => p.SortOrder)
                    .Select(p => new { p.Id, p.AltText }).FirstOrDefault() }).ToListAsync(ct);
        return Ok(new PagedResult<object>(items, page, pageSize, total));
    }

    [AllowAnonymous, HttpGet("products/{id:guid}")]
    public async Task<IActionResult> GetProduct(Guid id, CancellationToken ct)
    {
        var product = await db.Products.AsNoTracking().Where(x => x.Id == id)
            .Select(x => new
            {
                x.Id, x.Name, x.Slug, x.Description, x.BasePrice, x.IsAvailable, x.CategoryId,
                Discounts = x.QuantityDiscounts.OrderBy(d => d.MinimumQuantity)
                    .Select(d => new { d.Id, d.MinimumQuantity, d.DiscountPerUnit }),
                Category = x.Category == null ? null : new { x.Category.Id, x.Category.Name },
                Photos = x.Photos.OrderBy(p => p.SortOrder).Select(p => new { p.Id, p.AltText, p.IsPrimary, p.SortOrder }),
                Attributes = x.AttributeDefinitions.OrderBy(a => a.SortOrder).Select(a => new
                {
                    a.Id, a.Name, a.Code, a.IsRequired,
                    Values = a.Values.OrderBy(v => v.SortOrder).Select(v => new { v.Id, v.Value, v.IsActive })
                }),
                Variations = x.Variations.Where(v => v.IsAvailable).Select(v => new
                {
                    v.Id, v.Sku, v.DisplayName, v.PriceOverride, Price = v.PriceOverride ?? x.BasePrice,
                    Attributes = v.AttributeValues.Select(av => new { av.AttributeDefinitionId,
                        av.AttributeValueId, av.AttributeValue.Value })
                })
            }).SingleOrDefaultAsync(ct);
        return product is null ? NotFound() : Ok(product);
    }

    [Authorize(Roles = Roles.Administrator), HttpGet("admin/products")]
    public async Task<IActionResult> AdminList([FromQuery] bool? active, CancellationToken ct)
    {
        var query = db.Products.AsNoTracking();
        if (active.HasValue) query = query.Where(x => x.IsAvailable == active);
        return Ok(await query.OrderBy(x => x.Name).Select(x => new
        {
            x.Id, x.Name, x.Slug, x.Description, x.BasePrice, x.IsAvailable, x.CategoryId,
            Discounts = x.QuantityDiscounts.OrderBy(d => d.MinimumQuantity)
                .Select(d => new { d.Id, d.MinimumQuantity, d.DiscountPerUnit }),
            Photo = x.Photos.OrderByDescending(p => p.IsPrimary).ThenBy(p => p.SortOrder)
                .Select(p => new { p.Id, p.AltText }).FirstOrDefault()
        }).ToListAsync(ct));
    }

    [Authorize(Roles = Roles.Administrator), HttpPost("admin/products")]
    public async Task<IActionResult> CreateProduct(ProductRequest request, CancellationToken ct)
    {
        if (request.BasePrice <= 0)
            throw new AppException(400, "O preço base do produto deve ser maior que zero.");

        await EnsureCategory(request.CategoryId, ct);
        var now = DateTimeOffset.UtcNow;
        var product = new Product { Id = Guid.NewGuid(), CategoryId = request.CategoryId,
            Name = request.Name.Trim(), Slug = request.Slug.Trim().ToLowerInvariant(), Description = request.Description?.Trim(),
            BasePrice = request.BasePrice, IsAvailable = request.IsAvailable, CreatedAt = now, UpdatedAt = now,
            CreatedBy = currentUser.UserId, UpdatedBy = currentUser.UserId };
        db.Add(product); audit.Add("Product", product.Id, "ProductCreated");
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, new { product.Id });
    }

    [Authorize(Roles = Roles.Administrator), HttpDelete("admin/products/{id:guid}")]
    public async Task<IActionResult> DeleteProduct(Guid id, CancellationToken ct)
    {
        var product = await db.Products
            .Include(x => x.Photos)
            .Include(x => x.QuantityDiscounts)
            .Include(x => x.AttributeDefinitions).ThenInclude(a => a.Values)
            .Include(x => x.Variations).ThenInclude(v => v.AttributeValues)
            .SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new AppException(404, "Produto não encontrado.");

        var hasOrders = await db.OrderItems.AnyAsync(x => x.ProductId == id, ct);
        var hasBatches = await db.Batches.AnyAsync(x => x.ProductId == id, ct);

        if (hasOrders || hasBatches)
        {
            throw new AppException(400, "Este produto possui pedidos ou lotes de produção vinculados e não pode ser excluído permanentemente. Você pode desativar a disponibilidade do produto para que ele não apareça na loja.");
        }

        foreach (var photo in product.Photos)
        {
            try
            {
                var path = files.GetAbsolutePath(photo.StorageKey);
                if (System.IO.File.Exists(path))
                    System.IO.File.Delete(path);
            }
            catch
            {
                // Ignora erro no sistema de arquivos para não travar a exclusão no banco
            }
        }

        db.ProductPhotos.RemoveRange(product.Photos);
        db.ProductQuantityDiscounts.RemoveRange(product.QuantityDiscounts);
        foreach (var variation in product.Variations)
        {
            db.VariationAttributeValues.RemoveRange(variation.AttributeValues);
        }
        db.ProductVariations.RemoveRange(product.Variations);
        foreach (var attr in product.AttributeDefinitions)
        {
            db.ProductAttributeValues.RemoveRange(attr.Values);
        }
        db.ProductAttributeDefinitions.RemoveRange(product.AttributeDefinitions);
        db.Products.Remove(product);

        audit.Add("Product", id, "ProductDeleted", details: new { product.Name, product.Slug });
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [Authorize(Roles = Roles.Administrator), HttpPut("admin/products/{id:guid}")]
    public async Task<IActionResult> UpdateProduct(Guid id, ProductRequest request, CancellationToken ct)
    {
        if (request.BasePrice <= 0)
            throw new AppException(400, "O preço base do produto deve ser maior que zero.");

        await EnsureCategory(request.CategoryId, ct);
        var product = await db.Products.FindAsync([id], ct) ?? throw new AppException(404, "Produto não encontrado.");
        product.CategoryId = request.CategoryId; product.Name = request.Name.Trim();
        product.Slug = request.Slug.Trim().ToLowerInvariant(); product.Description = request.Description?.Trim();
        product.BasePrice = request.BasePrice; product.IsAvailable = request.IsAvailable;
        product.UpdatedAt = DateTimeOffset.UtcNow; product.UpdatedBy = currentUser.UserId;
        audit.Add("Product", id, "ProductUpdated"); await db.SaveChangesAsync(ct); return NoContent();
    }

    [Authorize(Roles = Roles.Administrator), HttpPatch("admin/products/{id:guid}/availability")]
    public async Task<IActionResult> Availability(Guid id, [FromBody] bool available, CancellationToken ct)
    {
        var product = await db.Products.FindAsync([id], ct) ?? throw new AppException(404, "Produto não encontrado.");
        product.IsAvailable = available; product.UpdatedAt = DateTimeOffset.UtcNow; product.UpdatedBy = currentUser.UserId;
        audit.Add("Product", id, available ? "ProductActivated" : "ProductDeactivated");
        await db.SaveChangesAsync(ct); return NoContent();
    }

    [Authorize(Roles = Roles.Administrator), HttpPost("admin/products/{productId:guid}/attributes")]
    public async Task<IActionResult> AddAttribute(Guid productId, AttributeDefinitionRequest request, CancellationToken ct)
    {
        if (!await db.Products.AnyAsync(x => x.Id == productId, ct)) throw new AppException(404, "Produto não encontrado.");
        var now = DateTimeOffset.UtcNow;
        var definition = new ProductAttributeDefinition { Id = Guid.NewGuid(), ProductId = productId,
            Name = request.Name.Trim(), Code = request.Code.Trim().ToLowerInvariant(), SortOrder = request.SortOrder,
            IsRequired = request.IsRequired, CreatedAt = now, UpdatedAt = now };
        foreach (var value in request.Values?.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct() ?? [])
            definition.Values.Add(new ProductAttributeValue { Id = Guid.NewGuid(), Value = value.Trim(),
                IsActive = true, CreatedAt = now, UpdatedAt = now });
        db.Add(definition); audit.Add("Product", productId, "ProductAttributeCreated", details: new { definition.Code });
        await db.SaveChangesAsync(ct); return Ok(new { definition.Id });
    }

    [Authorize(Roles = Roles.Administrator), HttpPost("admin/products/{productId:guid}/discounts")]
    public async Task<IActionResult> AddQuantityDiscount(Guid productId, QuantityDiscountRequest request, CancellationToken ct)
    {
        var product = await db.Products.Include(x => x.Variations).SingleOrDefaultAsync(x => x.Id == productId, ct)
            ?? throw new AppException(404, "Produto não encontrado.");
        if (await db.ProductQuantityDiscounts.AnyAsync(
                x => x.ProductId == productId && x.MinimumQuantity == request.MinimumQuantity, ct))
            throw new AppException(409, "Já existe um desconto para essa quantidade mínima.");

        var minimumPrice = product.Variations.Where(x => x.PriceOverride.HasValue)
            .Select(x => x.PriceOverride!.Value).Append(product.BasePrice).Min();
        if (request.DiscountPerUnit >= minimumPrice)
            throw new AppException(400, "O desconto por unidade precisa ser menor que o menor preço do produto.");

        var now = DateTimeOffset.UtcNow;
        var discount = new ProductQuantityDiscount
        {
            Id = Guid.NewGuid(), ProductId = productId, MinimumQuantity = request.MinimumQuantity,
            DiscountPerUnit = request.DiscountPerUnit, CreatedAt = now, UpdatedAt = now,
            CreatedBy = currentUser.UserId, UpdatedBy = currentUser.UserId
        };
        db.Add(discount);
        audit.Add("ProductQuantityDiscount", discount.Id, "QuantityDiscountCreated",
            details: new { productId, request.MinimumQuantity, request.DiscountPerUnit });
        await db.SaveChangesAsync(ct);
        return Ok(new { discount.Id });
    }

    [Authorize(Roles = Roles.Administrator), HttpDelete("admin/product-discounts/{id:guid}")]
    public async Task<IActionResult> DeleteQuantityDiscount(Guid id, CancellationToken ct)
    {
        var discount = await db.ProductQuantityDiscounts.FindAsync([id], ct)
            ?? throw new AppException(404, "Desconto não encontrado.");
        db.Remove(discount);
        audit.Add("ProductQuantityDiscount", id, "QuantityDiscountDeleted",
            details: new { discount.ProductId, discount.MinimumQuantity, discount.DiscountPerUnit });
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [Authorize(Roles = Roles.Administrator), HttpPost("admin/products/{productId:guid}/variations")]
    public async Task<IActionResult> AddVariation(Guid productId, VariationRequest request, CancellationToken ct)
    {
        if (request.PriceOverride < 0) throw new AppException(400, "Preço inválido.");
        var product = await db.Products.FindAsync([productId], ct) ?? throw new AppException(404, "Produto não encontrado.");
        var values = await db.ProductAttributeValues
            .Where(x => request.AttributeValueIds.Contains(x.Id))
            .Join(db.ProductAttributeDefinitions, v => v.AttributeDefinitionId, d => d.Id, (v, d) => new { Value = v, Definition = d })
            .ToListAsync(ct);
        if (values.Count != request.AttributeValueIds.Distinct().Count() || values.Any(x => x.Definition.ProductId != productId))
            throw new AppException(400, "Um ou mais atributos não pertencem ao produto.");
        if (values.GroupBy(x => x.Definition.Id).Any(x => x.Count() > 1))
            throw new AppException(400, "Informe apenas um valor por atributo.");
        var required = await db.ProductAttributeDefinitions.CountAsync(x => x.ProductId == productId && x.IsRequired, ct);
        if (values.Count(x => x.Definition.IsRequired) != required) throw new AppException(400, "Informe todos os atributos obrigatórios.");

        var now = DateTimeOffset.UtcNow;
        var variation = new ProductVariation { Id = Guid.NewGuid(), ProductId = product.Id,
            DisplayName = request.DisplayName.Trim(), Sku = request.Sku?.Trim(), PriceOverride = request.PriceOverride,
            IsAvailable = request.IsAvailable, CreatedAt = now, UpdatedAt = now,
            CreatedBy = currentUser.UserId, UpdatedBy = currentUser.UserId };
        foreach (var entry in values) variation.AttributeValues.Add(new VariationAttributeValue
        { VariationId = variation.Id, ProductId = productId, AttributeDefinitionId = entry.Definition.Id,
            AttributeValueId = entry.Value.Id, CreatedAt = now });
        db.Add(variation); audit.Add("ProductVariation", variation.Id, "VariationCreated", details: new { productId });
        await db.SaveChangesAsync(ct); return Ok(new { variation.Id });
    }

    [Authorize(Roles = Roles.Administrator), HttpPut("admin/variations/{id:guid}")]
    public async Task<IActionResult> UpdateVariation(Guid id, VariationRequest request, CancellationToken ct)
    {
        if (request.PriceOverride < 0) throw new AppException(400, "Preço inválido.");
        var variation = await db.ProductVariations.Include(x => x.AttributeValues).SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new AppException(404, "Variação não encontrada.");
        var values = await db.ProductAttributeValues.Where(x => request.AttributeValueIds.Contains(x.Id))
            .Join(db.ProductAttributeDefinitions, v => v.AttributeDefinitionId, d => d.Id, (v, d) => new { Value = v, Definition = d })
            .ToListAsync(ct);
        if (values.Any(x => x.Definition.ProductId != variation.ProductId) || values.Count != request.AttributeValueIds.Distinct().Count())
            throw new AppException(400, "Atributos inválidos.");
        if (values.GroupBy(x => x.Definition.Id).Any(x => x.Count() > 1))
            throw new AppException(400, "Informe apenas um valor por atributo.");
        var required = await db.ProductAttributeDefinitions.CountAsync(
            x => x.ProductId == variation.ProductId && x.IsRequired, ct);
        if (values.Count(x => x.Definition.IsRequired) != required)
            throw new AppException(400, "Informe todos os atributos obrigatórios.");
        db.VariationAttributeValues.RemoveRange(variation.AttributeValues);
        variation.DisplayName = request.DisplayName.Trim(); variation.Sku = request.Sku?.Trim();
        variation.PriceOverride = request.PriceOverride; variation.IsAvailable = request.IsAvailable;
        variation.UpdatedAt = DateTimeOffset.UtcNow; variation.UpdatedBy = currentUser.UserId;
        foreach (var entry in values) variation.AttributeValues.Add(new VariationAttributeValue
        { VariationId = id, ProductId = variation.ProductId, AttributeDefinitionId = entry.Definition.Id,
            AttributeValueId = entry.Value.Id, CreatedAt = DateTimeOffset.UtcNow });
        audit.Add("ProductVariation", id, "VariationUpdated"); await db.SaveChangesAsync(ct); return NoContent();
    }

    [Authorize(Roles = Roles.Administrator), HttpPost("admin/products/{productId:guid}/photos")]
    [RequestSizeLimit(5_242_880)]
    public async Task<IActionResult> UploadPhoto(Guid productId, IFormFile? file, [FromForm] string? altText,
        [FromForm] bool isPrimary, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            throw new AppException(400, "Nenhuma imagem foi selecionada para envio.");
        if (file.Length > 5_242_880)
            throw new AppException(400, "A imagem excede o tamanho máximo permitido de 5 MB.");

        if (!await db.Products.AnyAsync(x => x.Id == productId, ct)) throw new AppException(404, "Produto não encontrado.");
        var stored = await files.SaveProductImageAsync(file, ct);
        if (isPrimary) await db.ProductPhotos.Where(x => x.ProductId == productId && x.IsPrimary)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.IsPrimary, false), ct);
        var photo = new ProductPhoto { Id = Guid.NewGuid(), ProductId = productId, StorageKey = stored.StorageKey,
            OriginalFileName = stored.OriginalName, MimeType = stored.MimeType, FileSizeBytes = stored.Size,
            AltText = altText?.Trim(), IsPrimary = isPrimary, CreatedAt = DateTimeOffset.UtcNow, CreatedBy = currentUser.UserId };
        db.Add(photo); audit.Add("ProductPhoto", photo.Id, "ProductPhotoUploaded", details: new { productId });
        await db.SaveChangesAsync(ct); return Ok(new { photo.Id });
    }

    [Authorize(Roles = Roles.Administrator), HttpDelete("admin/product-photos/{id:guid}")]
    public async Task<IActionResult> DeletePhoto(Guid id, CancellationToken ct)
    {
        var photo = await db.ProductPhotos.FindAsync([id], ct) ?? throw new AppException(404, "Foto não encontrada.");
        db.Remove(photo); audit.Add("ProductPhoto", id, "ProductPhotoDeleted", details: new { photo.ProductId });
        await db.SaveChangesAsync(ct);
        var path = files.GetAbsolutePath(photo.StorageKey);
        if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
        return NoContent();
    }

    [AllowAnonymous, HttpGet("product-photos/{id:guid}")]
    public async Task<IActionResult> GetPhoto(Guid id, CancellationToken ct)
    {
        var photo = await db.ProductPhotos.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (photo is null) return NotFound();
        var path = files.GetAbsolutePath(photo.StorageKey);
        return System.IO.File.Exists(path) ? PhysicalFile(path, photo.MimeType, enableRangeProcessing: true) : NotFound();
    }

    [AllowAnonymous, HttpGet("categories")]
    public Task<List<Category>> Categories(CancellationToken ct) => db.Categories.AsNoTracking().Where(x => x.IsActive)
        .OrderBy(x => x.Name).ToListAsync(ct);

    [Authorize(Roles = Roles.Administrator), HttpPost("admin/categories")]
    public async Task<IActionResult> CreateCategory(CategoryRequest request, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var category = new Category { Id = Guid.NewGuid(), Name = request.Name.Trim(), Slug = request.Slug.Trim().ToLowerInvariant(),
            Description = request.Description?.Trim(), IsActive = request.IsActive, CreatedAt = now, UpdatedAt = now,
            CreatedBy = currentUser.UserId, UpdatedBy = currentUser.UserId };
        db.Add(category); audit.Add("Category", category.Id, "CategoryCreated"); await db.SaveChangesAsync(ct);
        return Ok(new { category.Id });
    }

    [Authorize(Roles = Roles.Administrator), HttpPut("admin/categories/{id:guid}")]
    public async Task<IActionResult> UpdateCategory(Guid id, CategoryRequest request, CancellationToken ct)
    {
        var category = await db.Categories.FindAsync([id], ct) ?? throw new AppException(404, "Categoria não encontrada.");
        category.Name = request.Name.Trim(); category.Slug = request.Slug.Trim().ToLowerInvariant();
        category.Description = request.Description?.Trim(); category.IsActive = request.IsActive;
        category.UpdatedAt = DateTimeOffset.UtcNow; category.UpdatedBy = currentUser.UserId;
        audit.Add("Category", id, "CategoryUpdated");
        await db.SaveChangesAsync(ct); return NoContent();
    }

    private async Task EnsureCategory(Guid? categoryId, CancellationToken ct)
    {
        if (categoryId.HasValue && !await db.Categories.AnyAsync(x => x.Id == categoryId, ct))
            throw new AppException(400, "Categoria inválida.");
    }
}
