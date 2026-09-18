using LojinhaCorsa.API.Contracts;
using LojinhaCorsa.API.Data;
using LojinhaCorsa.API.Domain;
using LojinhaCorsa.API.Infrastructure;
using LojinhaCorsa.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LojinhaCorsa.API.Controllers;

[ApiController, Authorize(Roles = Roles.Administrator), Route("api/admin/batches"), Route("admin/batches")]
public sealed class BatchesController(AppDbContext db, ICurrentUser currentUser,
    IAuditService audit, IBatchService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] Guid? productId, CancellationToken ct)
    {
        var query = db.Batches.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(x => x.StatusCode == status);
        if (productId.HasValue) query = query.Where(x => x.ProductId == productId);
        return Ok(await query.OrderByDescending(x => x.CreatedAt).Select(x => new { x.Id, x.BatchNumber,
            x.ProductId, ProductName = x.Product.Name, x.StatusCode, x.TotalQuantity, x.CreatedAt, x.ClosedAt,
            OrderCount = x.Orders.Count }).ToListAsync(ct));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().Where(x => x.Id == id).Select(x => new
        {
            x.Id, x.BatchNumber, x.ProductId, ProductName = x.Product.Name, x.StatusCode, x.Notes,
            x.TotalQuantity, x.CreatedAt, x.ClosedAt,
            Orders = x.Orders.Select(o => new { o.OrderId, o.Order.OrderNumber, o.Order.Member.User.FullName,
                Items = o.Items.Select(i => new { i.OrderItemId, i.VariationId, i.VariationNameSnapshot, i.Quantity }) }),
            Consolidation = x.ConsolidatedItems.Select(i => new { i.VariationId, i.VariationNameSnapshot,
                i.VariationAttributesSnapshot, i.Quantity })
        }).SingleOrDefaultAsync(ct);
        return batch is null ? NotFound() : Ok(batch);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateBatchRequest request, CancellationToken ct)
    {
        if (!await db.Products.AnyAsync(x => x.Id == request.ProductId, ct)) throw new AppException(400, "Produto inválido.");
        var now = DateTimeOffset.UtcNow;
        var batch = new Batch { Id = Guid.NewGuid(), ProductId = request.ProductId, StatusCode = BatchStatuses.Open,
            Notes = request.Notes?.Trim(), CreatedAt = now, UpdatedAt = now,
            CreatedBy = currentUser.UserId, UpdatedBy = currentUser.UserId };
        db.BatchStatusHistory.Add(new BatchStatusHistory
        {
            BatchId = batch.Id, NewStatusCode = BatchStatuses.Open,
            Notes = "Lote criado.", ChangedAt = now, ChangedBy = currentUser.UserId
        });
        db.Add(batch); audit.Add("Batch", batch.Id, "BatchCreated", newStatus: BatchStatuses.Open);
        await db.SaveChangesAsync(ct); return CreatedAtAction(nameof(Get), new { id = batch.Id }, new { batch.Id, batch.BatchNumber });
    }

    [HttpGet("{id:guid}/eligible-orders")]
    public async Task<IActionResult> Eligible(Guid id, CancellationToken ct)
    {
        var batch = await db.Batches.FindAsync([id], ct) ?? throw new AppException(404, "Lote não encontrado.");
        var allocated = db.BatchOrders.Where(x => x.ProductId == batch.ProductId).Select(x => x.OrderId);
        return Ok(await db.Orders.AsNoTracking().Where(x =>
            (x.StatusCode == OrderStatuses.PaymentConfirmed || x.StatusCode == OrderStatuses.AwaitingBatch || x.StatusCode == OrderStatuses.IncludedInBatch)
            && x.Items.Any(i => i.ProductId == batch.ProductId) && !allocated.Contains(x.Id))
            .Select(x => new { x.Id, x.OrderNumber, x.PlacedAt,
                Member = new { x.Member.Id, x.Member.User.FullName },
                ItemCount = x.Items.Where(i => i.ProductId == batch.ProductId).Sum(i => i.Quantity),
                Items = x.Items.Where(i => i.ProductId == batch.ProductId).Select(i => new { i.VariationId, i.VariationNameSnapshot, i.Quantity }) })
            .ToListAsync(ct));
    }

    [HttpPost("{batchId:guid}/orders/{orderId:guid}")]
    public async Task<IActionResult> AddOrder(Guid batchId, Guid orderId, CancellationToken ct)
    { await service.AddOrderAsync(batchId, orderId, ct); return NoContent(); }

    [HttpDelete("{batchId:guid}/orders/{orderId:guid}")]
    public async Task<IActionResult> RemoveOrder(Guid batchId, Guid orderId, CancellationToken ct)
    { await service.RemoveOrderAsync(batchId, orderId, ct); return NoContent(); }

    [HttpPost("{id:guid}/status")]
    public async Task<IActionResult> ChangeStatus(Guid id, ChangeBatchStatusRequest request, CancellationToken ct)
    { await service.ChangeStatusAsync(id, request.Status, request.Notes, ct); return NoContent(); }
}
