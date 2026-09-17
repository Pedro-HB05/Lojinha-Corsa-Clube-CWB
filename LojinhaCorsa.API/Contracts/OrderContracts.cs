using System.ComponentModel.DataAnnotations;

namespace LojinhaCorsa.API.Contracts;

public sealed record CreateOrderItemRequest(Guid VariationId, [Range(1, 1000)] int Quantity);
public sealed record CreateOrderRequest([Required, MinLength(1)] IReadOnlyList<CreateOrderItemRequest> Items,
    [MaxLength(2000)] string? Notes);
public sealed record RejectReceiptRequest([Required, MaxLength(50)] string ReasonCode,
    [MaxLength(2000)] string? Details);
public sealed record ChangeBatchStatusRequest([Required] string Status, string? Notes);
public sealed record CreateBatchRequest(Guid ProductId, [MaxLength(4000)] string? Notes);
public sealed record DeliverOrderRequest([MaxLength(2000)] string? Notes);
public sealed record CancelOrderRequest([MaxLength(2000)] string? Reason);
