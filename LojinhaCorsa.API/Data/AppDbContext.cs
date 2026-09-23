using System.Text;
using LojinhaCorsa.API.Domain;
using Microsoft.EntityFrameworkCore;

namespace LojinhaCorsa.API.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<Member> Members => Set<Member>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductQuantityDiscount> ProductQuantityDiscounts => Set<ProductQuantityDiscount>();
    public DbSet<ProductPhoto> ProductPhotos => Set<ProductPhoto>();
    public DbSet<ProductAttributeDefinition> ProductAttributeDefinitions => Set<ProductAttributeDefinition>();
    public DbSet<ProductAttributeValue> ProductAttributeValues => Set<ProductAttributeValue>();
    public DbSet<ProductVariation> ProductVariations => Set<ProductVariation>();
    public DbSet<VariationAttributeValue> VariationAttributeValues => Set<VariationAttributeValue>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<PaymentReceipt> PaymentReceipts => Set<PaymentReceipt>();
    public DbSet<OrderStatusHistory> OrderStatusHistory => Set<OrderStatusHistory>();
    public DbSet<PaymentReceiptStatusHistory> PaymentReceiptStatusHistory => Set<PaymentReceiptStatusHistory>();
    public DbSet<Batch> Batches => Set<Batch>();
    public DbSet<BatchOrder> BatchOrders => Set<BatchOrder>();
    public DbSet<BatchOrderItem> BatchOrderItems => Set<BatchOrderItem>();
    public DbSet<BatchConsolidatedItem> BatchConsolidatedItems => Set<BatchConsolidatedItem>();
    public DbSet<BatchStatusHistory> BatchStatusHistory => Set<BatchStatusHistory>();
    public DbSet<Delivery> Deliveries => Set<Delivery>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<PixSetting> PixSettings => Set<PixSetting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>().ToTable("users").HasIndex(x => x.Email).IsUnique();
        modelBuilder.Entity<Role>().ToTable("roles");
        modelBuilder.Entity<UserRole>().ToTable("user_roles").HasKey(x => new { x.UserId, x.RoleId });
        modelBuilder.Entity<UserRole>().HasOne(x => x.User).WithMany(x => x.UserRoles).HasForeignKey(x => x.UserId);
        modelBuilder.Entity<UserRole>().HasOne(x => x.Role).WithMany().HasForeignKey(x => x.RoleId);
        modelBuilder.Entity<Member>().ToTable("members").HasOne(x => x.User).WithOne(x => x.Member).HasForeignKey<Member>(x => x.UserId);
        modelBuilder.Entity<Category>().ToTable("categories");
        modelBuilder.Entity<Product>().ToTable("products").HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId);
        modelBuilder.Entity<ProductQuantityDiscount>().ToTable("product_quantity_discounts", table =>
        {
            table.HasCheckConstraint("ck_product_quantity_discounts_minimum_quantity", "minimum_quantity >= 2");
            table.HasCheckConstraint("ck_product_quantity_discounts_discount_per_unit", "discount_per_unit > 0");
        }).HasIndex(x => new { x.ProductId, x.MinimumQuantity }).IsUnique();
        modelBuilder.Entity<Product>().HasMany(x => x.QuantityDiscounts).WithOne(x => x.Product)
            .HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<ProductPhoto>().ToTable("product_photos");
        modelBuilder.Entity<Product>().HasMany(x => x.Photos).WithOne().HasForeignKey(x => x.ProductId);
        modelBuilder.Entity<ProductAttributeDefinition>().ToTable("product_attribute_definitions");
        modelBuilder.Entity<Product>().HasMany(x => x.AttributeDefinitions).WithOne().HasForeignKey(x => x.ProductId);
        modelBuilder.Entity<ProductAttributeValue>().ToTable("product_attribute_values");
        modelBuilder.Entity<ProductAttributeDefinition>().HasMany(x => x.Values).WithOne().HasForeignKey(x => x.AttributeDefinitionId);
        modelBuilder.Entity<ProductVariation>().ToTable("product_variations").HasOne(x => x.Product).WithMany(x => x.Variations).HasForeignKey(x => x.ProductId);
        modelBuilder.Entity<VariationAttributeValue>().ToTable("variation_attribute_values").HasKey(x => new { x.VariationId, x.AttributeDefinitionId });
        modelBuilder.Entity<ProductVariation>().HasMany(x => x.AttributeValues).WithOne().HasForeignKey(x => x.VariationId);
        modelBuilder.Entity<VariationAttributeValue>().HasOne(x => x.AttributeValue).WithMany().HasForeignKey(x => x.AttributeValueId);
        modelBuilder.Entity<Order>().ToTable("orders").HasOne(x => x.Member).WithMany().HasForeignKey(x => x.MemberId);
        modelBuilder.Entity<Order>().HasMany(x => x.Items).WithOne().HasForeignKey(x => x.OrderId);
        modelBuilder.Entity<Order>().HasMany(x => x.Receipts).WithOne().HasForeignKey(x => x.OrderId);
        modelBuilder.Entity<Order>().Property(x => x.OrderNumber).ValueGeneratedOnAdd();
        modelBuilder.Entity<OrderItem>().ToTable("order_items");
        modelBuilder.Entity<OrderItem>().Property(x => x.Subtotal).HasComputedColumnSql("quantity * unit_price", stored: true);
        modelBuilder.Entity<OrderItem>().Property(x => x.VariationAttributesSnapshot).HasColumnType("jsonb");
        modelBuilder.Entity<PaymentReceipt>().ToTable("payment_receipts");
        modelBuilder.Entity<OrderStatusHistory>().ToTable("order_status_history")
            .HasOne<Order>().WithMany().HasForeignKey(x => x.OrderId);
        modelBuilder.Entity<OrderStatusHistory>().Property(x => x.Id).ValueGeneratedOnAdd();
        modelBuilder.Entity<PaymentReceiptStatusHistory>().ToTable("payment_receipt_status_history")
            .HasOne<PaymentReceipt>().WithMany().HasForeignKey(x => x.PaymentReceiptId);
        modelBuilder.Entity<PaymentReceiptStatusHistory>().Property(x => x.Id).ValueGeneratedOnAdd();
        modelBuilder.Entity<Batch>().ToTable("batches").HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId);
        modelBuilder.Entity<Batch>().Property(x => x.BatchNumber).ValueGeneratedOnAdd();
        modelBuilder.Entity<BatchOrder>().ToTable("batch_orders").HasOne(x => x.Batch).WithMany(x => x.Orders).HasForeignKey(x => x.BatchId);
        modelBuilder.Entity<BatchOrder>().HasOne(x => x.Order).WithMany().HasForeignKey(x => x.OrderId);
        modelBuilder.Entity<BatchOrderItem>().ToTable("batch_order_items").Property(x => x.VariationAttributesSnapshot).HasColumnType("jsonb");
        modelBuilder.Entity<BatchOrder>().HasMany(x => x.Items).WithOne().HasForeignKey(x => x.BatchOrderId);
        modelBuilder.Entity<BatchConsolidatedItem>().ToTable("batch_consolidated_items").Property(x => x.VariationAttributesSnapshot).HasColumnType("jsonb");
        modelBuilder.Entity<Batch>().HasMany(x => x.ConsolidatedItems).WithOne().HasForeignKey(x => x.BatchId);
        modelBuilder.Entity<BatchStatusHistory>().ToTable("batch_status_history")
            .HasOne<Batch>().WithMany().HasForeignKey(x => x.BatchId);
        modelBuilder.Entity<BatchStatusHistory>().Property(x => x.Id).ValueGeneratedOnAdd();
        modelBuilder.Entity<Delivery>().ToTable("deliveries");
        modelBuilder.Entity<AuditLog>().ToTable("audit_logs").Property(x => x.Id).ValueGeneratedOnAdd();
        modelBuilder.Entity<AuditLog>().Property(x => x.Details).HasColumnType("jsonb");
        modelBuilder.Entity<PixSetting>().ToTable("pix_settings");

        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
                property.SetColumnName(ToSnakeCase(property.Name));
        }
    }

    private static string ToSnakeCase(string value)
    {
        var result = new StringBuilder(value.Length + 8);
        for (var i = 0; i < value.Length; i++)
        {
            if (char.IsUpper(value[i]) && i > 0) result.Append('_');
            result.Append(char.ToLowerInvariant(value[i]));
        }
        return result.ToString();
    }
}
