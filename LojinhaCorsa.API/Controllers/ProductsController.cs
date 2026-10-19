using LojinhaCorsa.API.Contracts;
using LojinhaCorsa.API.Data;
using LojinhaCorsa.API.Domain;
using LojinhaCorsa.API.Infrastructure;
using LojinhaCorsa.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Text;

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
                Photos = x.Photos.OrderByDescending(p => p.IsPrimary).ThenBy(p => p.SortOrder).ThenBy(p => p.CreatedAt).Select(p => new { p.Id, p.AltText, p.IsPrimary, p.SortOrder }),
                Attributes = x.AttributeDefinitions
                    .Where(a => a.Values.Any(v => v.IsActive))
                    .OrderBy(a => a.SortOrder)
                    .Select(a => new
                    {
                        a.Id, a.Name, a.Code, a.IsRequired,
                        Values = a.Values.Where(v => v.IsActive).OrderBy(v => v.SortOrder).Select(v => new { v.Id, v.Value, v.IsActive })
                    }),
                Variations = x.Variations.Where(v => v.IsAvailable).OrderBy(v => v.CreatedAt).Select(v => new
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
            CategoryName = x.Category != null ? x.Category.Name : null,
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
        db.AddRange(product, CreateDefaultVariation(product.Id, now));
        audit.Add("Product", product.Id, "ProductCreated");
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, new { product.Id });
    }

    [Authorize(Roles = Roles.Administrator), HttpPost("admin/products/simple")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(52_428_800)]
    public async Task<IActionResult> CreateSimpleProduct([FromForm] SimpleProductRequest request, CancellationToken ct)
    {
        if (request.Price <= 0)
            throw new AppException(400, "O preço deve ser maior que zero.");

        await EnsureCategory(request.CategoryId, ct);

        var uploadedFiles = new List<IFormFile>();
        if (request.Photos is { Count: > 0 })
            uploadedFiles.AddRange(request.Photos.Where(f => f is { Length: > 0 }));
        if (request.Photo is { Length: > 0 } && !uploadedFiles.Contains(request.Photo))
            uploadedFiles.Insert(0, request.Photo);

        if (uploadedFiles.Count == 0)
            throw new AppException(400, "Selecione pelo menos uma foto do produto.");

        var cleanSizes = new List<ProductSizeItemRequest>();
        if (!string.IsNullOrWhiteSpace(request.SizesJson))
        {
            List<ProductSizeItemRequest>? parsed;
            try
            {
                parsed = System.Text.Json.JsonSerializer.Deserialize<List<ProductSizeItemRequest>>(
                    request.SizesJson,
                    new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch
            {
                throw new AppException(400, "Formato inválido para a configuração de tamanhos.");
            }

            cleanSizes = (parsed ?? [])
                .Where(x => !string.IsNullOrWhiteSpace(x.Size))
                .Select(x => new ProductSizeItemRequest(x.Size.Trim(), x.Price))
                .GroupBy(x => x.Size, StringComparer.OrdinalIgnoreCase)
                .Select(g => g.First())
                .ToList();

            if (cleanSizes.Any(x => x.Price <= 0))
                throw new AppException(400, "Todos os tamanhos selecionados devem ter preço maior que zero.");
        }

        var cleanColors = new List<string>();
        if (!string.IsNullOrWhiteSpace(request.ColorsJson))
        {
            List<string>? parsedColors;
            try
            {
                parsedColors = System.Text.Json.JsonSerializer.Deserialize<List<string>>(
                    request.ColorsJson,
                    new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch
            {
                throw new AppException(400, "Formato inválido para a configuração de cores.");
            }

            cleanColors = (parsedColors ?? [])
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        var now = DateTimeOffset.UtcNow;
        var productId = Guid.NewGuid();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var storedFiles = new List<StoredFile>();
        try
        {
            var product = new Product
            {
                Id = productId,
                CategoryId = request.CategoryId,
                Name = request.Name.Trim(),
                Slug = CreateSlug(request.Name, productId),
                Description = request.Description?.Trim(),
                BasePrice = request.Price,
                IsAvailable = true,
                CreatedAt = now,
                UpdatedAt = now,
                CreatedBy = currentUser.UserId,
                UpdatedBy = currentUser.UserId
            };
            db.Add(product);

            ApplyProductSizesAndColors(product, cleanSizes, cleanColors, now, isNewProduct: true);

            for (var i = 0; i < uploadedFiles.Count; i++)
            {
                var stored = await files.SaveProductImageAsync(uploadedFiles[i], ct);
                storedFiles.Add(stored);
                var photo = new ProductPhoto
                {
                    Id = Guid.NewGuid(),
                    ProductId = productId,
                    StorageKey = stored.StorageKey,
                    OriginalFileName = stored.OriginalName,
                    MimeType = stored.MimeType,
                    FileSizeBytes = stored.Size,
                    AltText = product.Name,
                    SortOrder = i,
                    IsPrimary = i == 0,
                    CreatedAt = now,
                    CreatedBy = currentUser.UserId
                };
                db.Add(photo);
            }

            audit.Add("Product", productId, "ProductCreated", details: new { SimpleRegistration = true, PhotoCount = uploadedFiles.Count, SizeCount = cleanSizes.Count, ColorCount = cleanColors.Count });
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return CreatedAtAction(nameof(GetProduct), new { id = productId }, new { id = productId });
        }
        catch
        {
            await transaction.RollbackAsync(ct);
            foreach (var stored in storedFiles)
            {
                var path = files.GetAbsolutePath(stored.StorageKey);
                if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
            }
            throw;
        }
    }

    [Authorize(Roles = Roles.Administrator), HttpPut("admin/products/{productId:guid}/sizes")]
    public async Task<IActionResult> UpdateProductSizes(Guid productId, ProductSizesUpdateRequest request, CancellationToken ct)
    {
        var product = await db.Products
            .Include(x => x.AttributeDefinitions).ThenInclude(a => a.Values)
            .Include(x => x.Variations).ThenInclude(v => v.AttributeValues)
            .SingleOrDefaultAsync(x => x.Id == productId, ct)
            ?? throw new AppException(404, "Produto não encontrado.");

        var cleanSizes = (request.Sizes ?? [])
            .Where(x => !string.IsNullOrWhiteSpace(x.Size))
            .Select(x => new ProductSizeItemRequest(x.Size.Trim(), x.Price))
            .GroupBy(x => x.Size, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToList();

        if (cleanSizes.Any(x => x.Price <= 0))
            throw new AppException(400, "Todos os tamanhos selecionados devem ter preço maior que zero.");

        var cleanColors = (request.Colors ?? [])
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (request.BasePrice.HasValue)
        {
            if (request.BasePrice.Value <= 0)
                throw new AppException(400, "O preço base deve ser maior que zero.");
            product.BasePrice = request.BasePrice.Value;
        }
        else if (cleanSizes.Count > 0)
        {
            product.BasePrice = cleanSizes.Min(x => x.Price);
        }

        var now = DateTimeOffset.UtcNow;
        product.UpdatedAt = now;
        product.UpdatedBy = currentUser.UserId;

        ApplyProductSizesAndColors(product, cleanSizes, cleanColors, now, isNewProduct: false);

        audit.Add("Product", productId, "ProductSizesUpdated", details: new { SizeCount = cleanSizes.Count, ColorCount = cleanColors.Count });
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private void ApplyProductSizesAndColors(
        Product product,
        List<ProductSizeItemRequest> cleanSizes,
        List<string> cleanColors,
        DateTimeOffset now,
        bool isNewProduct)
    {
        var productId = product.Id;

        if (!isNewProduct)
        {
            foreach (var attr in product.AttributeDefinitions)
            {
                attr.IsRequired = false;
                attr.UpdatedAt = now;
                foreach (var val in attr.Values)
                {
                    val.IsActive = false;
                    val.UpdatedAt = now;
                }
            }

            foreach (var v in product.Variations)
            {
                v.IsAvailable = false;
                v.UpdatedAt = now;
            }
        }

        ProductAttributeDefinition EnsureAttrDefinition(string code, string name, int sortOrder)
        {
            var def = product.AttributeDefinitions.FirstOrDefault(a =>
                string.Equals(a.Code, code, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a.Name, name, StringComparison.OrdinalIgnoreCase));

            if (def is null)
            {
                def = new ProductAttributeDefinition
                {
                    Id = Guid.NewGuid(),
                    ProductId = productId,
                    Name = name,
                    Code = code,
                    SortOrder = sortOrder,
                    IsRequired = true,
                    CreatedAt = now,
                    UpdatedAt = now
                };
                product.AttributeDefinitions.Add(def);
                db.ProductAttributeDefinitions.Add(def);
            }
            else
            {
                def.Name = name;
                def.Code = code;
                def.SortOrder = sortOrder;
                def.IsRequired = true;
                def.UpdatedAt = now;
            }
            return def;
        }

        ProductAttributeValue EnsureAttrValue(ProductAttributeDefinition def, string text, int sortOrder)
        {
            var val = def.Values.FirstOrDefault(v =>
                string.Equals(v.Value.Trim(), text, StringComparison.OrdinalIgnoreCase));

            if (val is null)
            {
                val = new ProductAttributeValue
                {
                    Id = Guid.NewGuid(),
                    AttributeDefinitionId = def.Id,
                    Value = text,
                    SortOrder = sortOrder,
                    IsActive = true,
                    CreatedAt = now,
                    UpdatedAt = now
                };
                def.Values.Add(val);
                db.ProductAttributeValues.Add(val);
            }
            else
            {
                val.Value = text;
                val.SortOrder = sortOrder;
                val.IsActive = true;
                val.UpdatedAt = now;
            }
            return val;
        }

        void UpsertVariation(string displayName, decimal? priceOverride, IReadOnlyList<(Guid DefId, Guid ValId)> links)
        {
            ProductVariation? variation = null;
            if (!isNewProduct)
            {
                variation = product.Variations.FirstOrDefault(v =>
                    v.AttributeValues.Count == links.Count &&
                    links.All(l => v.AttributeValues.Any(av => av.AttributeDefinitionId == l.DefId && av.AttributeValueId == l.ValId)));
            }

            if (variation is null)
            {
                variation = new ProductVariation
                {
                    Id = Guid.NewGuid(),
                    ProductId = productId,
                    DisplayName = displayName,
                    PriceOverride = priceOverride,
                    IsAvailable = true,
                    CreatedAt = now,
                    UpdatedAt = now,
                    CreatedBy = currentUser.UserId,
                    UpdatedBy = currentUser.UserId
                };
                foreach (var link in links)
                {
                    variation.AttributeValues.Add(new VariationAttributeValue
                    {
                        VariationId = variation.Id,
                        ProductId = productId,
                        AttributeDefinitionId = link.DefId,
                        AttributeValueId = link.ValId,
                        CreatedAt = now
                    });
                }
                product.Variations.Add(variation);
                db.ProductVariations.Add(variation);
            }
            else
            {
                variation.DisplayName = displayName;
                variation.PriceOverride = priceOverride;
                variation.IsAvailable = true;
                variation.UpdatedAt = now;
                variation.UpdatedBy = currentUser.UserId;
            }
        }

        if (cleanSizes.Count == 0 && cleanColors.Count == 0)
        {
            UpsertVariation("Padrão", null, []);
            return;
        }

        if (cleanSizes.Count > 0 && cleanColors.Count == 0)
        {
            var sizeDef = EnsureAttrDefinition("tamanho", "Tamanho", 0);
            for (var i = 0; i < cleanSizes.Count; i++)
            {
                var s = cleanSizes[i];
                var sVal = EnsureAttrValue(sizeDef, s.Size, i);
                UpsertVariation($"Tamanho {s.Size}", s.Price, [(sizeDef.Id, sVal.Id)]);
            }
            return;
        }

        if (cleanSizes.Count == 0 && cleanColors.Count > 0)
        {
            var colorDef = EnsureAttrDefinition("cor", "Cor", 0);
            for (var j = 0; j < cleanColors.Count; j++)
            {
                var c = cleanColors[j];
                var cVal = EnsureAttrValue(colorDef, c, j);
                UpsertVariation($"Cor {c}", product.BasePrice, [(colorDef.Id, cVal.Id)]);
            }
            return;
        }

        var sizeAttrDef = EnsureAttrDefinition("tamanho", "Tamanho", 0);
        var colorAttrDef = EnsureAttrDefinition("cor", "Cor", 1);

        var sizeVals = new List<(ProductSizeItemRequest Item, ProductAttributeValue Val)>();
        for (var i = 0; i < cleanSizes.Count; i++)
        {
            sizeVals.Add((cleanSizes[i], EnsureAttrValue(sizeAttrDef, cleanSizes[i].Size, i)));
        }

        var colorVals = new List<(string Color, ProductAttributeValue Val)>();
        for (var j = 0; j < cleanColors.Count; j++)
        {
            colorVals.Add((cleanColors[j], EnsureAttrValue(colorAttrDef, cleanColors[j], j)));
        }

        foreach (var (sizeItem, sizeVal) in sizeVals)
        {
            foreach (var (colorName, colorVal) in colorVals)
            {
                UpsertVariation(
                    $"Tamanho {sizeItem.Size} • Cor {colorName}",
                    sizeItem.Price,
                    [(sizeAttrDef.Id, sizeVal.Id), (colorAttrDef.Id, colorVal.Id)]);
            }
        }
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

        var minimumPrice = product.Variations.Where(x => x.IsAvailable && x.PriceOverride.HasValue)
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
        try
        {
            if (isPrimary) await db.ProductPhotos.Where(x => x.ProductId == productId && x.IsPrimary)
                .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.IsPrimary, false), ct);
            var maxSort = await db.ProductPhotos.Where(x => x.ProductId == productId)
                .Select(x => (int?)x.SortOrder).MaxAsync(ct) ?? -1;
            var photo = new ProductPhoto { Id = Guid.NewGuid(), ProductId = productId, StorageKey = stored.StorageKey,
                OriginalFileName = stored.OriginalName, MimeType = stored.MimeType, FileSizeBytes = stored.Size,
                AltText = altText?.Trim(), SortOrder = maxSort + 1, IsPrimary = isPrimary, CreatedAt = DateTimeOffset.UtcNow, CreatedBy = currentUser.UserId };
            db.Add(photo); audit.Add("ProductPhoto", photo.Id, "PhotoUploaded", details: new { productId });
            await db.SaveChangesAsync(ct);
            return Ok(new { photo.Id });
        }
        catch
        {
            var path = files.GetAbsolutePath(stored.StorageKey);
            if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
            throw;
        }
    }

    [Authorize(Roles = Roles.Administrator), HttpDelete("admin/product-photos/{id:guid}")]
    public async Task<IActionResult> DeletePhoto(Guid id, CancellationToken ct)
    {
        var photo = await db.ProductPhotos.FindAsync([id], ct) ?? throw new AppException(404, "Foto não encontrada.");
        db.Remove(photo); audit.Add("ProductPhoto", id, "ProductPhotoDeleted", details: new { photo.ProductId });
        await db.SaveChangesAsync(ct);

        // If the deleted photo was primary, promote the next available photo
        if (photo.IsPrimary)
        {
            var nextPhoto = await db.ProductPhotos
                .Where(x => x.ProductId == photo.ProductId)
                .OrderBy(x => x.SortOrder)
                .FirstOrDefaultAsync(ct);
            if (nextPhoto is not null)
            {
                nextPhoto.IsPrimary = true;
                await db.SaveChangesAsync(ct);
            }
        }

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

    [Authorize(Roles = Roles.Administrator), HttpGet("admin/categories")]
    public async Task<IActionResult> AdminCategories(CancellationToken ct)
    {
        var items = await db.Categories.AsNoTracking()
            .OrderBy(x => x.Name)
            .Select(x => new
            {
                x.Id,
                x.Name,
                x.Slug,
                x.Description,
                x.IsActive,
                ProductCount = db.Products.Count(p => p.CategoryId == x.Id)
            })
            .ToListAsync(ct);
        return Ok(items);
    }

    [Authorize(Roles = Roles.Administrator), HttpPost("admin/categories")]
    public async Task<IActionResult> CreateCategory(CategoryRequest request, CancellationToken ct)
    {
        var name = request.Name.Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw new AppException(400, "Informe o nome da categoria.");

        if (await db.Categories.AnyAsync(x => x.Name.ToLower() == name.ToLower(), ct))
            throw new AppException(409, "Já existe uma categoria com esse nome.");

        var id = Guid.NewGuid();
        var rawSlug = string.IsNullOrWhiteSpace(request.Slug) ? CreateBaseSlug(name, "categoria") : CreateBaseSlug(request.Slug, "categoria");
        var slug = rawSlug;
        if (await db.Categories.AnyAsync(x => x.Slug == slug, ct))
            slug = $"{rawSlug}-{id.ToString("N")[..4]}";

        var now = DateTimeOffset.UtcNow;
        var category = new Category
        {
            Id = id,
            Name = name,
            Slug = slug,
            Description = request.Description?.Trim(),
            IsActive = request.IsActive,
            CreatedAt = now,
            UpdatedAt = now,
            CreatedBy = currentUser.UserId,
            UpdatedBy = currentUser.UserId
        };
        db.Add(category);
        audit.Add("Category", category.Id, "CategoryCreated", details: new { category.Name, category.Slug });
        await db.SaveChangesAsync(ct);
        return Ok(new { category.Id, category.Name, category.Slug, category.Description, category.IsActive });
    }

    [Authorize(Roles = Roles.Administrator), HttpPut("admin/categories/{id:guid}")]
    public async Task<IActionResult> UpdateCategory(Guid id, CategoryRequest request, CancellationToken ct)
    {
        var category = await db.Categories.FindAsync([id], ct) ?? throw new AppException(404, "Categoria não encontrada.");
        var name = request.Name.Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw new AppException(400, "Informe o nome da categoria.");

        if (await db.Categories.AnyAsync(x => x.Id != id && x.Name.ToLower() == name.ToLower(), ct))
            throw new AppException(409, "Já existe outra categoria com esse nome.");

        var rawSlug = string.IsNullOrWhiteSpace(request.Slug) ? CreateBaseSlug(name, "categoria") : CreateBaseSlug(request.Slug, "categoria");
        var slug = rawSlug;
        if (await db.Categories.AnyAsync(x => x.Id != id && x.Slug == slug, ct))
            slug = $"{rawSlug}-{id.ToString("N")[..4]}";

        category.Name = name;
        category.Slug = slug;
        category.Description = request.Description?.Trim();
        category.IsActive = request.IsActive;
        category.UpdatedAt = DateTimeOffset.UtcNow;
        category.UpdatedBy = currentUser.UserId;
        audit.Add("Category", id, "CategoryUpdated", details: new { category.Name, category.Slug });
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [Authorize(Roles = Roles.Administrator), HttpDelete("admin/categories/{id:guid}")]
    public async Task<IActionResult> DeleteCategory(Guid id, CancellationToken ct)
    {
        var category = await db.Categories.FindAsync([id], ct) ?? throw new AppException(404, "Categoria não encontrada.");

        await db.Products.Where(p => p.CategoryId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.CategoryId, (Guid?)null), ct);

        db.Categories.Remove(category);
        audit.Add("Category", id, "CategoryDeleted", details: new { category.Name });
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private async Task EnsureCategory(Guid? categoryId, CancellationToken ct)
    {
        if (categoryId.HasValue && !await db.Categories.AnyAsync(x => x.Id == categoryId, ct))
            throw new AppException(400, "Categoria inválida.");
    }

    private ProductVariation CreateDefaultVariation(Guid productId, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        ProductId = productId,
        DisplayName = "Padrão",
        IsAvailable = true,
        CreatedAt = now,
        UpdatedAt = now,
        CreatedBy = currentUser.UserId,
        UpdatedBy = currentUser.UserId
    };

    private static string CreateBaseSlug(string value, string fallback)
    {
        var normalized = value.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var slug = new StringBuilder(normalized.Length);
        var separatorPending = false;

        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
                continue;
            if (char.IsLetterOrDigit(character))
            {
                if (separatorPending && slug.Length > 0) slug.Append('-');
                slug.Append(character);
                separatorPending = false;
            }
            else
            {
                separatorPending = true;
            }
        }

        return slug.Length == 0 ? fallback : slug.ToString();
    }

    private static string CreateSlug(string value, Guid id)
    {
        var baseSlug = CreateBaseSlug(value, "produto");
        return $"{baseSlug}-{id.ToString("N")[..6]}";
    }
}
