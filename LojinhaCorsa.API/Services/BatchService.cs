using LojinhaCorsa.API.Data;
using LojinhaCorsa.API.Domain;
using LojinhaCorsa.API.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace LojinhaCorsa.API.Services;

public interface IBatchService
{
    Task AddOrderAsync(Guid batchId, Guid orderId, CancellationToken ct);
    Task RemoveOrderAsync(Guid batchId, Guid orderId, CancellationToken ct);
    Task ChangeStatusAsync(Guid batchId, string status, string? notes, CancellationToken ct);
}

public sealed class BatchService(AppDbContext db, ICurrentUser currentUser, IAuditService audit) : IBatchService
{
    public async Task AddOrderAsync(Guid batchId, Guid orderId, CancellationToken ct)
    {
        var batch = await db.Batches.SingleOrDefaultAsync(x => x.Id == batchId, ct)
            ?? throw new AppException(404, "Lote não encontrado.");
        if (batch.StatusCode != BatchStatuses.Open) throw new AppException(409, "O lote não está aberto.");
        var order = await db.Orders.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == orderId, ct)
            ?? throw new AppException(404, "Pedido não encontrado.");
        if (order.StatusCode is not (OrderStatuses.PaymentConfirmed or OrderStatuses.AwaitingBatch or OrderStatuses.IncludedInBatch))
            throw new AppException(409, "O pedido não possui pagamento confirmado.");
        var items = order.Items.Where(x => x.ProductId == batch.ProductId).ToList();
        if (items.Count == 0) throw new AppException(400, "O pedido não possui itens do produto deste lote.");
        if (await db.BatchOrders.AnyAsync(x => x.OrderId == orderId && x.ProductId == batch.ProductId, ct))
            throw new AppException(409, "Este pedido já foi alocado para um lote deste produto.");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var link = new BatchOrder { Id = Guid.NewGuid(), BatchId = batchId, ProductId = batch.ProductId,
            OrderId = orderId, AddedAt = DateTimeOffset.UtcNow, AddedBy = currentUser.UserId };
        foreach (var item in items) link.Items.Add(new BatchOrderItem { Id = Guid.NewGuid(), OrderItemId = item.Id,
            VariationId = item.VariationId, Quantity = item.Quantity, ProductNameSnapshot = item.ProductNameSnapshot,
            VariationNameSnapshot = item.VariationNameSnapshot, VariationAttributesSnapshot = item.VariationAttributesSnapshot,
            CreatedAt = DateTimeOffset.UtcNow });
        db.Add(link);
        var now = DateTimeOffset.UtcNow;
        var previous = order.StatusCode; order.StatusCode = OrderStatuses.IncludedInBatch;
        order.UpdatedAt = now; order.UpdatedBy = currentUser.UserId;
        db.OrderStatusHistory.Add(new OrderStatusHistory
        {
            OrderId = orderId, PreviousStatusCode = previous,
            NewStatusCode = OrderStatuses.IncludedInBatch,
            Notes = $"Pedido incluído no lote {batch.BatchNumber}.", ChangedAt = now, ChangedBy = currentUser.UserId
        });
        audit.Add("Batch", batchId, "OrderAddedToBatch", details: new { orderId });
        audit.Add("Order", orderId, "OrderIncludedInBatch", previous, order.StatusCode, new { batchId });
        await db.SaveChangesAsync(ct);
        await RebuildConsolidationAsync(batch, ct);
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
    }

    public async Task RemoveOrderAsync(Guid batchId, Guid orderId, CancellationToken ct)
    {
        var batch = await db.Batches.SingleOrDefaultAsync(x => x.Id == batchId, ct)
            ?? throw new AppException(404, "Lote não encontrado.");
        if (batch.StatusCode != BatchStatuses.Open) throw new AppException(409, "Pedidos só podem ser removidos de lotes abertos.");
        var link = await db.BatchOrders.Include(x => x.Items)
            .SingleOrDefaultAsync(x => x.BatchId == batchId && x.OrderId == orderId, ct)
            ?? throw new AppException(404, "Pedido não está neste lote.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        db.BatchOrderItems.RemoveRange(link.Items); await db.SaveChangesAsync(ct);
        db.BatchOrders.Remove(link);
        var order = await db.Orders.SingleAsync(x => x.Id == orderId, ct);
        var now = DateTimeOffset.UtcNow;
        if (!await db.BatchOrders.AnyAsync(x => x.OrderId == orderId && x.Id != link.Id, ct))
        {
            var previous = order.StatusCode;
            order.StatusCode = OrderStatuses.AwaitingBatch; order.UpdatedAt = now; order.UpdatedBy = currentUser.UserId;
            db.OrderStatusHistory.Add(new OrderStatusHistory
            {
                OrderId = orderId, PreviousStatusCode = previous,
                NewStatusCode = OrderStatuses.AwaitingBatch,
                Notes = $"Pedido removido do lote {batch.BatchNumber}.", ChangedAt = now, ChangedBy = currentUser.UserId
            });
        }
        audit.Add("Batch", batchId, "OrderRemovedFromBatch", details: new { orderId });
        await db.SaveChangesAsync(ct);
        await RebuildConsolidationAsync(batch, ct);
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
    }

    public async Task ChangeStatusAsync(Guid batchId, string status, string? notes, CancellationToken ct)
    {
        var valid = new[] { BatchStatuses.Closed, BatchStatuses.SentToProduction, BatchStatuses.InProduction,
            BatchStatuses.ProductionCompleted, BatchStatuses.Received, BatchStatuses.Cancelled };
        if (!valid.Contains(status)) throw new AppException(400, "Status de lote inválido.");
        var batch = await db.Batches.Include(x => x.Orders).SingleOrDefaultAsync(x => x.Id == batchId, ct)
            ?? throw new AppException(404, "Lote não encontrado.");
        var allowed = (batch.StatusCode, status) switch
        {
            (BatchStatuses.Open, BatchStatuses.Closed or BatchStatuses.Cancelled) => true,
            (BatchStatuses.Closed, BatchStatuses.SentToProduction or BatchStatuses.Cancelled) => true,
            (BatchStatuses.SentToProduction, BatchStatuses.InProduction or BatchStatuses.Cancelled) => true,
            (BatchStatuses.InProduction, BatchStatuses.ProductionCompleted or BatchStatuses.Cancelled) => true,
            (BatchStatuses.ProductionCompleted, BatchStatuses.Received) => true,
            _ => false
        };
        if (!allowed) throw new AppException(409, $"Transição de {batch.StatusCode} para {status} não permitida.");
        if (status == BatchStatuses.Closed && batch.Orders.Count == 0) throw new AppException(409, "Não é possível fechar lote vazio.");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var now = DateTimeOffset.UtcNow;
        var previous = batch.StatusCode; batch.StatusCode = status; batch.Notes = notes?.Trim() ?? batch.Notes;
        batch.UpdatedAt = now;
        batch.UpdatedBy = currentUser.UserId;
        if (status == BatchStatuses.Closed) batch.ClosedAt = now;
        db.BatchStatusHistory.Add(new BatchStatusHistory
        {
            BatchId = batchId, PreviousStatusCode = previous, NewStatusCode = status,
            Notes = notes?.Trim(), ChangedAt = now, ChangedBy = currentUser.UserId
        });
        var orderIds = batch.Orders.Select(x => x.OrderId).Distinct().ToArray();
        audit.Add("Batch", batchId, "BatchStatusChanged", previous, status, new { notes });
        await db.SaveChangesAsync(ct);

        var orders = await db.Orders.Where(x => orderIds.Contains(x.Id)).ToListAsync(ct);
        string? orderStatus = status switch
        {
            BatchStatuses.InProduction => OrderStatuses.InProduction,
            BatchStatuses.Received => OrderStatuses.ReadyForDelivery,
            BatchStatuses.Cancelled => OrderStatuses.AwaitingBatch,
            _ => null
        };
        if (orderStatus is not null)
        {
            foreach (var order in orders)
            {
                if (status == BatchStatuses.Received)
                {
                    var itemIds = await db.OrderItems.Where(x => x.OrderId == order.Id).Select(x => x.Id).ToListAsync(ct);
                    var receivedItemCount = await db.BatchOrderItems
                        .Where(x => itemIds.Contains(x.OrderItemId))
                        .Join(db.BatchOrders, item => item.BatchOrderId, link => link.Id, (item, link) => new { item, link })
                        .Join(db.Batches, pair => pair.link.BatchId, linkedBatch => linkedBatch.Id,
                            (pair, linkedBatch) => new { pair.item.OrderItemId, linkedBatch.StatusCode })
                        .CountAsync(x => x.StatusCode == BatchStatuses.Received, ct);
                    if (receivedItemCount != itemIds.Count) continue;
                }
                var previousOrderStatus = order.StatusCode;
                order.StatusCode = orderStatus;
                order.UpdatedBy = currentUser.UserId;
                order.UpdatedAt = now;

                db.OrderStatusHistory.Add(new OrderStatusHistory
                {
                    OrderId = order.Id,
                    PreviousStatusCode = previousOrderStatus,
                    NewStatusCode = orderStatus,
                    Notes = status == BatchStatuses.Cancelled ? $"Lote cancelado: {notes ?? "Retornado para fila de produção"}" : $"Lote atualizado para {status}",
                    ChangedBy = currentUser.UserId,
                    ChangedAt = now
                });

                audit.Add("Order", order.Id, "OrderStatusChanged", previousOrderStatus, orderStatus,
                    new { batchId, reason = status == BatchStatuses.Cancelled ? "BatchCancelled" : "BatchStatusChange" });
            }
        }
        if (status == BatchStatuses.Cancelled && batch.Orders.Count != 0)
        {
            db.BatchOrders.RemoveRange(batch.Orders);
            await db.BatchConsolidatedItems.Where(x => x.BatchId == batchId).ExecuteDeleteAsync(ct);
            batch.TotalQuantity = 0;
        }
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
    }

    private async Task RebuildConsolidationAsync(Batch batch, CancellationToken ct)
    {
        var items = await db.BatchOrderItems.AsNoTracking()
            .Where(item => db.BatchOrders.Any(link => link.Id == item.BatchOrderId && link.BatchId == batch.Id))
            .ToListAsync(ct);

        await db.BatchConsolidatedItems.Where(x => x.BatchId == batch.Id).ExecuteDeleteAsync(ct);
        batch.TotalQuantity = items.Sum(x => x.Quantity);
        batch.UpdatedAt = DateTimeOffset.UtcNow;

        foreach (var group in items.GroupBy(x => x.VariationId))
        {
            var sample = group.First();
            db.BatchConsolidatedItems.Add(new BatchConsolidatedItem
            {
                Id = Guid.NewGuid(), BatchId = batch.Id, VariationId = group.Key,
                Quantity = group.Sum(x => x.Quantity), ProductNameSnapshot = sample.ProductNameSnapshot,
                VariationNameSnapshot = sample.VariationNameSnapshot,
                VariationAttributesSnapshot = System.Text.Json.JsonDocument.Parse(
                    sample.VariationAttributesSnapshot.RootElement.GetRawText()),
                CreatedAt = DateTimeOffset.UtcNow
            });
        }
    }
}
