using LojinhaCorsa.API.Contracts;
using LojinhaCorsa.API.Data;
using LojinhaCorsa.API.Domain;
using LojinhaCorsa.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LojinhaCorsa.API.Controllers;

[ApiController, Authorize(Roles = Roles.Administrator), Route("api/admin/payments")]
public sealed class PaymentsController(AppDbContext db, IPaymentService service) : ControllerBase
{
    [HttpGet("pending")]
    public async Task<IActionResult> Pending(CancellationToken ct) => Ok(await db.PaymentReceipts.AsNoTracking()
        .Where(x => x.StatusCode == ReceiptStatuses.Pending).OrderBy(x => x.SubmittedAt)
        .Join(db.Orders, r => r.OrderId, o => o.Id, (r, o) => new { r.Id, r.OrderId, o.OrderNumber,
            MemberName = o.Member.User.FullName, r.SequenceNumber, r.StatusCode,
            r.ReportedAmount, r.SubmittedAt, OrderTotal = o.TotalAmount }).ToListAsync(ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var receipt = await db.PaymentReceipts.AsNoTracking().Where(x => x.Id == id)
            .Join(db.Orders, r => r.OrderId, o => o.Id, (r, o) => new { r.Id, r.OrderId, o.OrderNumber,
                r.SequenceNumber, r.ReportedAmount, r.StatusCode, r.SubmittedAt, r.ReviewedAt,
                r.RejectionReasonCode, r.RejectionDetails, r.OriginalFileName, r.MimeType, r.FileSizeBytes })
            .SingleOrDefaultAsync(ct);
        return receipt is null ? NotFound() : Ok(receipt);
    }

    [HttpGet("{id:guid}/history")]
    public async Task<IActionResult> History(Guid id, CancellationToken ct)
    {
        if (!await db.PaymentReceipts.AnyAsync(x => x.Id == id, ct)) return NotFound();
        return Ok(await db.PaymentReceiptStatusHistory.AsNoTracking().Where(x => x.PaymentReceiptId == id)
            .OrderBy(x => x.ChangedAt).ToListAsync(ct));
    }

    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct)
    { await service.ApproveAsync(id, ct); return NoContent(); }

    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, RejectReceiptRequest request, CancellationToken ct)
    { await service.RejectAsync(id, request.ReasonCode, request.Details, ct); return NoContent(); }
}
