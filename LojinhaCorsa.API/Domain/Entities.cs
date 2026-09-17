using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

namespace LojinhaCorsa.API.Domain;

public static class Roles
{
    public const string Member = "member";
    public const string Administrator = "administrator";
}

public static class OrderStatuses
{
    public const string AwaitingPayment = "awaiting_payment";
    public const string AwaitingValidation = "awaiting_validation";
    public const string ReceiptRejected = "receipt_rejected";
    public const string PaymentConfirmed = "payment_confirmed";
    public const string AwaitingBatch = "awaiting_batch";
    public const string IncludedInBatch = "included_in_batch";
    public const string InProduction = "in_production";
    public const string ReadyForDelivery = "ready_for_delivery";
    public const string Delivered = "delivered";
    public const string Cancelled = "cancelled";
}

public static class ReceiptStatuses
{
    public const string Pending = "pending";
    public const string Approved = "approved";
    public const string Rejected = "rejected";
}

public static class BatchStatuses
{
    public const string Open = "open";
    public const string Closed = "closed";
    public const string SentToProduction = "sent_to_production";
    public const string InProduction = "in_production";
    public const string ProductionCompleted = "production_completed";
    public const string Received = "received";
    public const string Cancelled = "cancelled";
}

public sealed class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string FullName { get; set; } = "";
    public string StatusCode { get; set; } = "active";
    public DateTimeOffset? LastLoginAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
    public Member? Member { get; set; }
    public ICollection<UserRole> UserRoles { get; set; } = [];
}

public sealed class Role
{
    public Guid Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class UserRole
{
    public Guid UserId { get; set; }
    public Guid RoleId { get; set; }
    public DateTimeOffset GrantedAt { get; set; }
    public Guid? GrantedBy { get; set; }
    public User User { get; set; } = null!;
    public Role Role { get; set; } = null!;
}

public sealed class Member
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string? MembershipNumber { get; set; }
    public string? Phone { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public User User { get; set; } = null!;
}

public sealed class Category
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public string? Description { get; set; }
    public bool IsActive { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
}

public sealed class Product
{
    public Guid Id { get; set; }
    public Guid? CategoryId { get; set; }
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public string? Description { get; set; }
    public decimal BasePrice { get; set; }
    public bool IsAvailable { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
    public Category? Category { get; set; }
    public ICollection<ProductVariation> Variations { get; set; } = [];
    public ICollection<ProductPhoto> Photos { get; set; } = [];
    public ICollection<ProductAttributeDefinition> AttributeDefinitions { get; set; } = [];
    public ICollection<ProductQuantityDiscount> QuantityDiscounts { get; set; } = [];
}

public sealed class ProductQuantityDiscount
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public int MinimumQuantity { get; set; }
    public decimal DiscountPerUnit { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
    public Product Product { get; set; } = null!;
}

public sealed class ProductPhoto
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public string StorageKey { get; set; } = "";
    public string OriginalFileName { get; set; } = "";
    public string MimeType { get; set; } = "";
    public long FileSizeBytes { get; set; }
    public string? AltText { get; set; }
    public int SortOrder { get; set; }
    public bool IsPrimary { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
}

public sealed class ProductAttributeDefinition
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public string Name { get; set; } = "";
    public string Code { get; set; } = "";
    public int SortOrder { get; set; }
    public bool IsRequired { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public ICollection<ProductAttributeValue> Values { get; set; } = [];
}

public sealed class ProductAttributeValue
{
    public Guid Id { get; set; }
    public Guid AttributeDefinitionId { get; set; }
    public string Value { get; set; } = "";
    public int SortOrder { get; set; }
    public bool IsActive { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class ProductVariation
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public string? Sku { get; set; }
    public string DisplayName { get; set; } = "";
    public decimal? PriceOverride { get; set; }
    public bool IsAvailable { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
    public Product Product { get; set; } = null!;
    public ICollection<VariationAttributeValue> AttributeValues { get; set; } = [];
}

public sealed class VariationAttributeValue
{
    public Guid VariationId { get; set; }
    public Guid ProductId { get; set; }
    public Guid AttributeDefinitionId { get; set; }
    public Guid AttributeValueId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public ProductAttributeValue AttributeValue { get; set; } = null!;
}

public sealed class Order
{
    public Guid Id { get; set; }
    public long OrderNumber { get; set; }
    public Guid MemberId { get; set; }
    public string StatusCode { get; set; } = OrderStatuses.AwaitingPayment;
    public decimal TotalAmount { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset PlacedAt { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
    public Guid? ApprovedReceiptId { get; set; }
    public Member Member { get; set; } = null!;
    public ICollection<OrderItem> Items { get; set; } = [];
    public ICollection<PaymentReceipt> Receipts { get; set; } = [];
}

public sealed class OrderItem
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public Guid ProductId { get; set; }
    public Guid VariationId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal Subtotal { get; private set; }
    public string ProductNameSnapshot { get; set; } = "";
    public string VariationNameSnapshot { get; set; } = "";
    public JsonDocument VariationAttributesSnapshot { get; set; } = JsonDocument.Parse("{}");
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
}

public sealed class PaymentReceipt
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public int SequenceNumber { get; set; }
    public string StorageKey { get; set; } = "";
    public string OriginalFileName { get; set; } = "";
    public string MimeType { get; set; } = "";
    public long FileSizeBytes { get; set; }
    public string? Sha256 { get; set; }
    public decimal? ReportedAmount { get; set; }
    public string StatusCode { get; set; } = ReceiptStatuses.Pending;
    public string? RejectionReasonCode { get; set; }
    public string? RejectionDetails { get; set; }
    public DateTimeOffset SubmittedAt { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public Guid? ReviewedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
}

public sealed class OrderStatusHistory
{
    public long Id { get; set; }
    public Guid OrderId { get; set; }
    public string? PreviousStatusCode { get; set; }
    public string NewStatusCode { get; set; } = "";
    public string? Notes { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public Guid? ChangedBy { get; set; }
}

public sealed class PaymentReceiptStatusHistory
{
    public long Id { get; set; }
    public Guid PaymentReceiptId { get; set; }
    public string? PreviousStatusCode { get; set; }
    public string NewStatusCode { get; set; } = "";
    public string? RejectionReasonCode { get; set; }
    public string? Details { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public Guid? ChangedBy { get; set; }
}

public sealed class Batch
{
    public Guid Id { get; set; }
    public long BatchNumber { get; set; }
    public Guid ProductId { get; set; }
    public string StatusCode { get; set; } = BatchStatuses.Open;
    public string? Notes { get; set; }
    public int TotalQuantity { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
    public Product Product { get; set; } = null!;
    public ICollection<BatchOrder> Orders { get; set; } = [];
    public ICollection<BatchConsolidatedItem> ConsolidatedItems { get; set; } = [];
}

public sealed class BatchOrder
{
    public Guid Id { get; set; }
    public Guid BatchId { get; set; }
    public Guid ProductId { get; set; }
    public Guid OrderId { get; set; }
    public DateTimeOffset AddedAt { get; set; }
    public Guid? AddedBy { get; set; }
    public Batch Batch { get; set; } = null!;
    public Order Order { get; set; } = null!;
    public ICollection<BatchOrderItem> Items { get; set; } = [];
}

public sealed class BatchOrderItem
{
    public Guid Id { get; set; }
    public Guid BatchOrderId { get; set; }
    public Guid OrderItemId { get; set; }
    public Guid VariationId { get; set; }
    public int Quantity { get; set; }
    public string ProductNameSnapshot { get; set; } = "";
    public string VariationNameSnapshot { get; set; } = "";
    public JsonDocument VariationAttributesSnapshot { get; set; } = JsonDocument.Parse("{}");
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class BatchConsolidatedItem
{
    public Guid Id { get; set; }
    public Guid BatchId { get; set; }
    public Guid VariationId { get; set; }
    public int Quantity { get; set; }
    public string ProductNameSnapshot { get; set; } = "";
    public string VariationNameSnapshot { get; set; } = "";
    public JsonDocument VariationAttributesSnapshot { get; set; } = JsonDocument.Parse("{}");
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class BatchStatusHistory
{
    public long Id { get; set; }
    public Guid BatchId { get; set; }
    public string? PreviousStatusCode { get; set; }
    public string NewStatusCode { get; set; } = "";
    public string? Notes { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public Guid? ChangedBy { get; set; }
}

public sealed class Delivery
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public DateTimeOffset DeliveredAt { get; set; }
    public Guid DeliveredBy { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class AuditLog
{
    public long Id { get; set; }
    public Guid? UserId { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
    public string EntityType { get; set; } = "";
    public string EntityId { get; set; } = "";
    public string Action { get; set; } = "";
    public string? PreviousStatus { get; set; }
    public string? NewStatus { get; set; }
    public JsonDocument Details { get; set; } = JsonDocument.Parse("{}");
    public System.Net.IPAddress? IpAddress { get; set; }
    public Guid? CorrelationId { get; set; }
}

public sealed class PixSetting
{
    public Guid Id { get; set; }
    public string PixKey { get; set; } = "";
    public string KeyType { get; set; } = "";
    public string BeneficiaryName { get; set; } = "";
    public string? BeneficiaryCity { get; set; }
    public string? Instructions { get; set; }
    public bool IsActive { get; set; }
    public DateTimeOffset ValidFrom { get; set; }
    public DateTimeOffset? ValidUntil { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
}
