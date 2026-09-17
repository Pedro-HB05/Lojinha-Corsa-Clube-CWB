using LojinhaCorsa.API.Data;
using LojinhaCorsa.API.Domain;
using LojinhaCorsa.API.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace LojinhaCorsa.API.Services;

public interface IPaymentService
{
    Task<PaymentReceipt> SubmitAsync(Guid orderId, IFormFile file, decimal? reportedAmount, CancellationToken ct);
    Task ApproveAsync(Guid receiptId, CancellationToken ct);
    Task RejectAsync(Guid receiptId, string reason, string? details, CancellationToken ct);
}

public sealed class PaymentService(AppDbContext db, ICurrentUser currentUser, IAuditService audit,
    IFileStorage files, IOrderService orders) : IPaymentService
{
    public async Task<PaymentReceipt> SubmitAsync(Guid orderId, IFormFile file, decimal? reportedAmount, CancellationToken ct)
    {
        var order = await orders.AccessibleOrders().SingleOrDefaultAsync(x => x.Id == orderId, ct)
            ?? throw new AppException(404, "Pedido não encontrado.");
        if (order.StatusCode is not (OrderStatuses.AwaitingPayment or OrderStatuses.ReceiptRejected))
            throw new AppException(409, "O pedido não aceita um novo comprovante neste status.");
        var stored = await files.SaveReceiptAsync(file, ct);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var sequence = await db.PaymentReceipts.Where(x => x.OrderId == orderId).MaxAsync(x => (int?)x.SequenceNumber, ct) ?? 0;
        var now = DateTimeOffset.UtcNow;
        var receipt = new PaymentReceipt { Id = Guid.NewGuid(), OrderId = orderId, SequenceNumber = sequence + 1,
            StorageKey = stored.StorageKey, OriginalFileName = stored.OriginalName, MimeType = stored.MimeType,
            FileSizeBytes = stored.Size, Sha256 = stored.Sha256, ReportedAmount = reportedAmount,
            StatusCode = ReceiptStatuses.Pending, SubmittedAt = now, CreatedAt = now, UpdatedAt = now,
            CreatedBy = currentUser.UserId };
        var previous = order.StatusCode; order.StatusCode = OrderStatuses.AwaitingValidation;
        order.UpdatedAt = now; order.UpdatedBy = currentUser.UserId;
        db.PaymentReceiptStatusHistory.Add(new PaymentReceiptStatusHistory
        {
            PaymentReceiptId = receipt.Id, NewStatusCode = ReceiptStatuses.Pending,
            ChangedAt = now, ChangedBy = currentUser.UserId
        });
        db.OrderStatusHistory.Add(new OrderStatusHistory
        {
            OrderId = order.Id, PreviousStatusCode = previous,
            NewStatusCode = OrderStatuses.AwaitingValidation,
            Notes = "Comprovante enviado para análise.", ChangedAt = now, ChangedBy = currentUser.UserId
        });
        db.Add(receipt); audit.Add("PaymentReceipt", receipt.Id, "ReceiptSubmitted", details: new { orderId, receipt.SequenceNumber });
        audit.Add("Order", order.Id, "OrderStatusChanged", previous, order.StatusCode);
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return receipt;
    }

    public async Task ApproveAsync(Guid receiptId, CancellationToken ct)
    {
        var receipt = await db.PaymentReceipts.SingleOrDefaultAsync(x => x.Id == receiptId, ct)
            ?? throw new AppException(404, "Comprovante não encontrado.");
        if (receipt.StatusCode != ReceiptStatuses.Pending) throw new AppException(409, "Comprovante já analisado.");
        var order = await db.Orders.SingleAsync(x => x.Id == receipt.OrderId, ct);
        if (order.StatusCode != OrderStatuses.AwaitingValidation) throw new AppException(409, "Pedido não aguarda validação.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var now = DateTimeOffset.UtcNow;
        receipt.StatusCode = ReceiptStatuses.Approved; receipt.ReviewedAt = now;
        receipt.UpdatedAt = now; receipt.ReviewedBy = currentUser.UserId;
        db.PaymentReceiptStatusHistory.Add(new PaymentReceiptStatusHistory
        {
            PaymentReceiptId = receipt.Id, PreviousStatusCode = ReceiptStatuses.Pending,
            NewStatusCode = ReceiptStatuses.Approved, ChangedAt = now, ChangedBy = currentUser.UserId
        });
        audit.Add("PaymentReceipt", receipt.Id, "ReceiptApproved", ReceiptStatuses.Pending, ReceiptStatuses.Approved);
        await db.SaveChangesAsync(ct);

        var previous = order.StatusCode; order.ApprovedReceiptId = receipt.Id; order.StatusCode = OrderStatuses.PaymentConfirmed;
        order.UpdatedAt = now; order.UpdatedBy = currentUser.UserId;
        db.OrderStatusHistory.Add(new OrderStatusHistory
        {
            OrderId = order.Id, PreviousStatusCode = previous,
            NewStatusCode = OrderStatuses.PaymentConfirmed,
            Notes = "Pagamento confirmado.", ChangedAt = now, ChangedBy = currentUser.UserId
        });
        audit.Add("Order", order.Id, "PaymentConfirmed", previous, OrderStatuses.PaymentConfirmed);
        await db.SaveChangesAsync(ct);
        order.StatusCode = OrderStatuses.AwaitingBatch;
        db.OrderStatusHistory.Add(new OrderStatusHistory
        {
            OrderId = order.Id, PreviousStatusCode = OrderStatuses.PaymentConfirmed,
            NewStatusCode = OrderStatuses.AwaitingBatch,
            Notes = "Pedido liberado para inclusão em lote.", ChangedAt = now, ChangedBy = currentUser.UserId
        });
        audit.Add("Order", order.Id, "OrderAwaitingBatch", OrderStatuses.PaymentConfirmed, OrderStatuses.AwaitingBatch);
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
    }

    public async Task RejectAsync(Guid receiptId, string reason, string? details, CancellationToken ct)
    {
        var receipt = await db.PaymentReceipts.SingleOrDefaultAsync(x => x.Id == receiptId, ct)
            ?? throw new AppException(404, "Comprovante não encontrado.");
        if (receipt.StatusCode != ReceiptStatuses.Pending) throw new AppException(409, "Comprovante já analisado.");
        var rejection = await db.Database.SqlQueryRaw<string>("SELECT code AS \"Value\" FROM receipt_rejection_reasons WHERE code = {0} AND is_active", reason)
            .AnyAsync(ct);
        if (!rejection) throw new AppException(400, "Motivo de rejeição inválido.");
        if (reason == "other" && string.IsNullOrWhiteSpace(details)) throw new AppException(400, "Detalhe o motivo da rejeição.");
        var order = await db.Orders.SingleAsync(x => x.Id == receipt.OrderId, ct);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var now = DateTimeOffset.UtcNow;
        receipt.StatusCode = ReceiptStatuses.Rejected; receipt.RejectionReasonCode = reason;
        receipt.RejectionDetails = details?.Trim(); receipt.ReviewedAt = now;
        receipt.UpdatedAt = now; receipt.ReviewedBy = currentUser.UserId;
        var previous = order.StatusCode; order.StatusCode = OrderStatuses.ReceiptRejected; order.UpdatedBy = currentUser.UserId;
        order.UpdatedAt = now;
        db.PaymentReceiptStatusHistory.Add(new PaymentReceiptStatusHistory
        {
            PaymentReceiptId = receipt.Id, PreviousStatusCode = ReceiptStatuses.Pending,
            NewStatusCode = ReceiptStatuses.Rejected, RejectionReasonCode = reason,
            Details = details?.Trim(), ChangedAt = now, ChangedBy = currentUser.UserId
        });
        db.OrderStatusHistory.Add(new OrderStatusHistory
        {
            OrderId = order.Id, PreviousStatusCode = previous,
            NewStatusCode = OrderStatuses.ReceiptRejected,
            Notes = string.IsNullOrWhiteSpace(details) ? "Comprovante recusado." : details.Trim(),
            ChangedAt = now, ChangedBy = currentUser.UserId
        });
        audit.Add("PaymentReceipt", receipt.Id, "ReceiptRejected", ReceiptStatuses.Pending, ReceiptStatuses.Rejected, new { reason, details });
        audit.Add("Order", order.Id, "OrderStatusChanged", previous, order.StatusCode);
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
    }
}
