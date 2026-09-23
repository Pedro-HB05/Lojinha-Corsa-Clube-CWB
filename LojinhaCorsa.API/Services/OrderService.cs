using System.Text.Json;
using LojinhaCorsa.API.Contracts;
using LojinhaCorsa.API.Data;
using LojinhaCorsa.API.Domain;
using LojinhaCorsa.API.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace LojinhaCorsa.API.Services;

public interface IOrderService
{
    Task<Order> CreateAsync(CreateOrderRequest request, CancellationToken ct);
    IQueryable<Order> AccessibleOrders();
    Task<Order> CancelAsync(Guid id, string? reason, CancellationToken ct);
}

public sealed class OrderService(AppDbContext db, ICurrentUser currentUser, IAuditService audit) : IOrderService
{
    public IQueryable<Order> AccessibleOrders()
    {
        var query = db.Orders.AsQueryable();
        if (!currentUser.IsAdministrator)
        {
            var memberId = currentUser.MemberId ?? throw new AppException(403, "Usuário não possui perfil de membro.");
            query = query.Where(x => x.MemberId == memberId);
        }
        return query;
    }

    public async Task<Order> CancelAsync(Guid id, string? reason, CancellationToken ct)
    {
        var order = await AccessibleOrders().SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new AppException(404, "Pedido não encontrado.");

        if (order.StatusCode == OrderStatuses.Cancelled)
            throw new AppException(409, "O pedido já está cancelado.");

        if (order.StatusCode == OrderStatuses.Delivered)
            throw new AppException(409, "Não é possível cancelar um pedido que já foi entregue.");

        if (!currentUser.IsAdministrator)
        {
            var allowedMemberStatuses = new[] { OrderStatuses.AwaitingPayment, OrderStatuses.AwaitingValidation, OrderStatuses.ReceiptRejected };
            if (!allowedMemberStatuses.Contains(order.StatusCode))
                throw new AppException(409, "Este pedido já está em fase de produção ou entrega e só pode ser cancelado pela administração.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var now = DateTimeOffset.UtcNow;
        var previousStatus = order.StatusCode;

        var batchOrders = await db.BatchOrders
            .Include(x => x.Items)
            .Where(x => x.OrderId == id).ToListAsync(ct);
        var affectedBatchIds = batchOrders.Select(x => x.BatchId).Distinct().ToArray();
        if (batchOrders.Count != 0)
        {
            foreach (var bo in batchOrders)
                db.BatchOrderItems.RemoveRange(bo.Items);
            db.BatchOrders.RemoveRange(batchOrders);
        }

        order.StatusCode = OrderStatuses.Cancelled;
        order.CancelledAt = now;
        order.UpdatedAt = now;
        order.UpdatedBy = currentUser.UserId;

        db.OrderStatusHistory.Add(new OrderStatusHistory
        {
            OrderId = order.Id,
            PreviousStatusCode = previousStatus,
            NewStatusCode = OrderStatuses.Cancelled,
            Notes = string.IsNullOrWhiteSpace(reason) ? "Pedido cancelado." : $"Cancelamento: {reason.Trim()}",
            ChangedBy = currentUser.UserId,
            ChangedAt = now
        });

        audit.Add("Order", order.Id, "OrderCancelled", previousStatus, OrderStatuses.Cancelled, new { reason });

        await db.SaveChangesAsync(ct);
        foreach (var batchId in affectedBatchIds)
        {
            var b = await db.Batches.SingleAsync(x => x.Id == batchId, ct);
            b.TotalQuantity = await db.BatchOrderItems
                .Where(item => db.BatchOrders.Any(link => link.Id == item.BatchOrderId && link.BatchId == batchId))
                .SumAsync(x => x.Quantity, ct);
            b.UpdatedAt = DateTimeOffset.UtcNow;
        }
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return order;
    }

    public async Task<Order> CreateAsync(CreateOrderRequest request, CancellationToken ct)
    {
        if (request.Items.Count == 0) throw new AppException(400, "O pedido precisa ter pelo menos um item.");
        if (request.Items.Select(x => x.VariationId).Distinct().Count() != request.Items.Count)
            throw new AppException(400, "Agrupe quantidades da mesma variação em um único item.");
        var memberId = currentUser.MemberId;
        if (!memberId.HasValue)
        {
            var member = await db.Members.SingleOrDefaultAsync(x => x.UserId == currentUser.UserId, ct);
            if (member is null)
            {
                var nowTs = DateTimeOffset.UtcNow;
                member = new Member
                {
                    Id = Guid.NewGuid(),
                    UserId = currentUser.UserId,
                    CreatedAt = nowTs,
                    UpdatedAt = nowTs
                };
                db.Members.Add(member);
                await db.SaveChangesAsync(ct);
            }
            memberId = member.Id;
        }
        var ids = request.Items.Select(x => x.VariationId).ToArray();
        var variations = await db.ProductVariations.Include(x => x.Product).ThenInclude(x => x.QuantityDiscounts)
            .Include(x => x.AttributeValues)
            .ThenInclude(x => x.AttributeValue).Where(x => ids.Contains(x.Id)).ToListAsync(ct);
        if (variations.Count != ids.Length || variations.Any(x => !x.IsAvailable || !x.Product.IsAvailable))
            throw new AppException(400, "Uma ou mais variações não existem ou estão indisponíveis.");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var now = DateTimeOffset.UtcNow;
        var order = new Order { Id = Guid.NewGuid(), MemberId = memberId.Value, StatusCode = OrderStatuses.AwaitingPayment,
            Notes = request.Notes?.Trim(), PlacedAt = now, CreatedAt = now, UpdatedAt = now,
            CreatedBy = currentUser.UserId, UpdatedBy = currentUser.UserId };
        var quantitiesByProduct = request.Items
            .Join(variations, requested => requested.VariationId, variation => variation.Id,
                (requested, variation) => new { variation.ProductId, requested.Quantity })
            .GroupBy(x => x.ProductId)
            .ToDictionary(x => x.Key, x => x.Sum(item => item.Quantity));

        foreach (var requested in request.Items)
        {
            var variation = variations.Single(x => x.Id == requested.VariationId);
            var attributes = variation.AttributeValues
                .Where(x => x.AttributeValue != null)
                .DistinctBy(x => x.AttributeDefinitionId)
                .ToDictionary(x => x.AttributeDefinitionId.ToString(), x => x.AttributeValue.Value);
            var productQuantity = quantitiesByProduct[variation.ProductId];
            var discountPerUnit = variation.Product.QuantityDiscounts
                .Where(x => productQuantity >= x.MinimumQuantity)
                .OrderByDescending(x => x.MinimumQuantity)
                .Select(x => x.DiscountPerUnit)
                .FirstOrDefault();
            var originalUnitPrice = variation.PriceOverride ?? variation.Product.BasePrice;
            var finalUnitPrice = Math.Max(0m, originalUnitPrice - discountPerUnit);
            order.Items.Add(new OrderItem { Id = Guid.NewGuid(), ProductId = variation.ProductId, VariationId = variation.Id,
                Quantity = requested.Quantity, UnitPrice = finalUnitPrice,
                ProductNameSnapshot = variation.Product.Name, VariationNameSnapshot = variation.DisplayName,
                VariationAttributesSnapshot = JsonDocument.Parse(JsonSerializer.Serialize(attributes)), CreatedAt = now,
                UpdatedAt = now, CreatedBy = currentUser.UserId });
        }
        order.TotalAmount = order.Items.Sum(x => x.Quantity * x.UnitPrice);
        db.Add(order);
        db.OrderStatusHistory.Add(new OrderStatusHistory
        {
            OrderId = order.Id,
            NewStatusCode = OrderStatuses.AwaitingPayment,
            Notes = "Pedido criado.",
            ChangedBy = currentUser.UserId,
            ChangedAt = now
        });
        audit.Add("Order", order.Id, "OrderCreated", newStatus: OrderStatuses.AwaitingPayment,
            details: new { DiscountTotal = request.Items.Sum(requested =>
            {
                var variation = variations.Single(x => x.Id == requested.VariationId);
                var item = order.Items.Single(x => x.VariationId == requested.VariationId);
                var originalPrice = variation.PriceOverride ?? variation.Product.BasePrice;
                return (originalPrice - item.UnitPrice) * requested.Quantity;
            }) });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return order;
    }
}
