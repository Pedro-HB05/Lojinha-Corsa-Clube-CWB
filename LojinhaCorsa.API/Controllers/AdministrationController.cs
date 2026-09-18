using LojinhaCorsa.API.Contracts;
using LojinhaCorsa.API.Data;
using LojinhaCorsa.API.Domain;
using LojinhaCorsa.API.Infrastructure;
using LojinhaCorsa.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LojinhaCorsa.API.Controllers;

[ApiController, Authorize(Roles = Roles.Administrator), Route("api/admin"), Route("admin")]
public sealed class AdministrationController(AppDbContext db, ICurrentUser currentUser, IAuditService audit) : ControllerBase
{
    [HttpGet("administrators")]
    public async Task<IActionResult> Administrators(CancellationToken ct)
    {
        return Ok(await db.UserRoles.AsNoTracking()
            .Where(x => x.Role.Code == Roles.Administrator)
            .OrderBy(x => x.User.FullName)
            .Select(x => new
            {
                x.User.Id,
                x.User.FullName,
                x.User.Email,
                x.User.StatusCode,
                x.GrantedAt
            }).ToListAsync(ct));
    }

    [HttpPost("administrators")]
    public async Task<IActionResult> GrantAdministrator(GrantAdministratorRequest request, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.Include(x => x.UserRoles).ThenInclude(x => x.Role)
            .SingleOrDefaultAsync(x => x.Email == email, ct)
            ?? throw new AppException(404, "Nenhum usuário foi encontrado com este e-mail.");
        if (user.StatusCode != "active")
            throw new AppException(409, "O usuário precisa estar ativo para receber acesso administrativo.");
        if (user.UserRoles.Any(x => x.Role.Code == Roles.Administrator))
            throw new AppException(409, "Este usuário já é administrador.");

        var role = await db.Roles.SingleAsync(x => x.Code == Roles.Administrator, ct);
        db.UserRoles.Add(new UserRole
        {
            UserId = user.Id,
            RoleId = role.Id,
            GrantedAt = DateTimeOffset.UtcNow,
            GrantedBy = currentUser.UserId
        });
        audit.Add("User", user.Id, "AdministratorGranted", details: new { user.Email });
        await db.SaveChangesAsync(ct);
        return Ok(new { user.Id, user.FullName, user.Email, Message = "Acesso administrativo concedido. O usuário deve entrar novamente." });
    }

    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard(CancellationToken ct)
    {
        var orderCounts = await db.Orders.AsNoTracking().GroupBy(x => x.StatusCode)
            .Select(x => new { Status = x.Key, Count = x.Count() }).ToDictionaryAsync(x => x.Status, x => x.Count, ct);
        var activeBatches = await db.Batches.CountAsync(x => x.StatusCode != BatchStatuses.Received && x.StatusCode != BatchStatuses.Cancelled, ct);
        var totalOrders = orderCounts.Values.Sum();
        var activeProducts = await db.Products.CountAsync(x => x.IsAvailable, ct);
        var pendingPayments = await db.PaymentReceipts.CountAsync(x => x.StatusCode == ReceiptStatuses.Pending, ct);
        return Ok(new
        {
            totalOrders, activeProducts, pendingPayments,
            awaitingPayment = orderCounts.GetValueOrDefault(OrderStatuses.AwaitingPayment),
            awaitingValidation = orderCounts.GetValueOrDefault(OrderStatuses.AwaitingValidation),
            paymentConfirmed = orderCounts.GetValueOrDefault(OrderStatuses.PaymentConfirmed),
            awaitingBatch = orderCounts.GetValueOrDefault(OrderStatuses.AwaitingBatch),
            inProduction = orderCounts.GetValueOrDefault(OrderStatuses.InProduction),
            readyForDelivery = orderCounts.GetValueOrDefault(OrderStatuses.ReadyForDelivery),
            delivered = orderCounts.GetValueOrDefault(OrderStatuses.Delivered),
            activeBatches
        });
    }

    [HttpGet("deliveries/ready")]
    public async Task<IActionResult> ReadyDeliveries([FromQuery] string? search, CancellationToken ct)
    {
        var query = db.Orders.AsNoTracking().Where(x => x.StatusCode == OrderStatuses.ReadyForDelivery);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = long.TryParse(term.TrimStart('#'), out var orderNumber)
                ? query.Where(x => x.OrderNumber == orderNumber || EF.Functions.ILike(x.Member.User.FullName, $"%{term}%"))
                : query.Where(x => EF.Functions.ILike(x.Member.User.FullName, $"%{term}%"));
        }
        return Ok(await query.OrderBy(x => x.UpdatedAt).Select(x => new { OrderId = x.Id, x.OrderNumber,
            MemberName = x.Member.User.FullName, x.TotalAmount, x.PlacedAt, ItemCount = x.Items.Count,
            Items = x.Items.Select(i => new { i.ProductNameSnapshot, i.VariationNameSnapshot, i.Quantity }) }).ToListAsync(ct));
    }

    [HttpPost("deliveries/{orderId:guid}")]
    public async Task<IActionResult> Deliver(Guid orderId, DeliverOrderRequest request, CancellationToken ct)
    {
        var order = await db.Orders.SingleOrDefaultAsync(x => x.Id == orderId, ct)
            ?? throw new AppException(404, "Pedido não encontrado.");
        if (order.StatusCode != OrderStatuses.ReadyForDelivery) throw new AppException(409, "Pedido não está pronto para entrega.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var now = DateTimeOffset.UtcNow;
        db.Deliveries.Add(new Delivery { Id = Guid.NewGuid(), OrderId = orderId, DeliveredAt = now,
            DeliveredBy = currentUser.UserId, Notes = request.Notes?.Trim(), CreatedAt = now });
        order.StatusCode = OrderStatuses.Delivered; order.UpdatedAt = now; order.UpdatedBy = currentUser.UserId;
        db.OrderStatusHistory.Add(new OrderStatusHistory
        {
            OrderId = orderId, PreviousStatusCode = OrderStatuses.ReadyForDelivery,
            NewStatusCode = OrderStatuses.Delivered, Notes = request.Notes?.Trim(),
            ChangedAt = now, ChangedBy = currentUser.UserId
        });
        audit.Add("Order", orderId, "OrderDelivered", OrderStatuses.ReadyForDelivery, OrderStatuses.Delivered, new { request.Notes });
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return NoContent();
    }

    [HttpGet("audit")]
    public async Task<IActionResult> Audit([FromQuery] string? entity, [FromQuery] Guid? userId,
        [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50, CancellationToken ct = default)
    {
        (page, pageSize) = Paging.Normalize(page, pageSize);
        var query = db.AuditLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(entity)) query = query.Where(x => x.EntityType == entity);
        if (userId.HasValue) query = query.Where(x => x.UserId == userId);
        if (from.HasValue) query = query.Where(x => x.OccurredAt >= from);
        if (to.HasValue) query = query.Where(x => x.OccurredAt <= to);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.OccurredAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var items = rows.Select(x => new
        {
            x.Id, x.UserId, CreatedAt = x.OccurredAt, Entity = x.EntityType, x.EntityId, x.Action,
            x.PreviousStatus, x.NewStatus, x.Details,
            IpAddress = x.IpAddress?.ToString(), x.CorrelationId
        }).ToList();
        return Ok(new { items, page, pageSize, totalCount = total, totalPages = (int)Math.Ceiling(total / (double)pageSize) });
    }

    [HttpGet("members")]
    public async Task<IActionResult> Members([FromQuery] string? search, CancellationToken ct)
    {
        var query = db.Members.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search)) query = query.Where(x => EF.Functions.ILike(x.User.FullName, $"%{search.Trim()}%")
            || EF.Functions.ILike(x.User.Email, $"%{search.Trim()}%"));
        return Ok(await query.OrderBy(x => x.User.FullName).Select(x => new { x.Id, x.UserId, x.User.FullName,
            x.User.Email, x.User.StatusCode, x.Phone, x.MembershipNumber }).ToListAsync(ct));
    }
}
