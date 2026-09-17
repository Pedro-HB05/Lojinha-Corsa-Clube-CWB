using LojinhaCorsa.API.Contracts;
using LojinhaCorsa.API.Data;
using LojinhaCorsa.API.Domain;
using LojinhaCorsa.API.Infrastructure;
using LojinhaCorsa.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LojinhaCorsa.API.Controllers;

[ApiController, Authorize, Route("api/orders")]
public sealed class OrdersController(AppDbContext db, IOrderService service, IPaymentService payments,
    IFileStorage files) : ControllerBase
{
    [Authorize(Roles = Roles.Member), HttpPost]
    public async Task<IActionResult> Create(CreateOrderRequest request, CancellationToken ct)
    {
        var order = await service.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = order.Id }, new { order.Id, order.OrderNumber, order.TotalAmount });
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelOrderRequest? request, CancellationToken ct)
    {
        var order = await service.CancelAsync(id, request?.Reason, ct);
        return Ok(new { order.Id, order.OrderNumber, order.StatusCode });
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        (page, pageSize) = Paging.Normalize(page, pageSize);
        var query = service.AccessibleOrders().AsNoTracking();
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(x => x.StatusCode == status);
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x => x.PlacedAt).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.Id, x.OrderNumber, x.StatusCode, x.TotalAmount, x.PlacedAt,
                Member = new { x.Member.Id, x.Member.User.FullName }, ItemCount = x.Items.Count }).ToListAsync(ct);
        return Ok(new { items, page, pageSize, totalCount = total, totalPages = (int)Math.Ceiling(total / (double)pageSize) });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var order = await service.AccessibleOrders().AsNoTracking().Where(x => x.Id == id).Select(x => new
        {
            x.Id, x.OrderNumber, x.StatusCode, x.TotalAmount, x.Notes, x.PlacedAt,
            Member = new { x.Member.Id, x.Member.User.FullName, x.Member.User.Email, x.Member.Phone },
            Items = x.Items.Select(i => new { i.Id, i.ProductId, i.VariationId, i.ProductNameSnapshot,
                i.VariationNameSnapshot, i.VariationAttributesSnapshot, i.Quantity, i.UnitPrice, i.Subtotal }),
            Receipts = x.Receipts.OrderByDescending(r => r.SequenceNumber).Select(r => new { r.Id, r.SequenceNumber,
                r.StatusCode, r.SubmittedAt, r.ReviewedAt, r.RejectionReasonCode, r.RejectionDetails })
        }).SingleOrDefaultAsync(ct);
        return order is null ? NotFound() : Ok(order);
    }

    [HttpGet("{id:guid}/history")]
    public async Task<IActionResult> History(Guid id, CancellationToken ct)
    {
        if (!await service.AccessibleOrders().AnyAsync(x => x.Id == id, ct)) return NotFound();
        return Ok(await db.OrderStatusHistory.AsNoTracking().Where(x => x.OrderId == id)
            .OrderBy(x => x.ChangedAt).Select(x => new
            {
                x.Id, StatusCode = x.NewStatusCode, CreatedAt = x.ChangedAt, x.Notes, x.ChangedBy
            }).ToListAsync(ct));
    }

    [Authorize(Roles = Roles.Member), HttpPost("{id:guid}/receipts")]
    [RequestSizeLimit(10_485_760)]
    public async Task<IActionResult> SubmitReceipt(Guid id, IFormFile file, [FromForm] decimal? reportedAmount, CancellationToken ct)
    {
        var receipt = await payments.SubmitAsync(id, file, reportedAmount, ct);
        return Ok(new { receipt.Id, receipt.SequenceNumber, receipt.StatusCode });
    }

    [HttpGet("{orderId:guid}/receipts/{receiptId:guid}/file")]
    public async Task<IActionResult> ReceiptFile(Guid orderId, Guid receiptId, CancellationToken ct)
    {
        if (!await service.AccessibleOrders().AnyAsync(x => x.Id == orderId, ct)) return NotFound();
        var receipt = await db.PaymentReceipts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == receiptId && x.OrderId == orderId, ct);
        if (receipt is null) return NotFound();
        var path = files.GetAbsolutePath(receipt.StorageKey);
        return System.IO.File.Exists(path) ? PhysicalFile(path, receipt.MimeType, enableRangeProcessing: true) : NotFound();
    }
}
