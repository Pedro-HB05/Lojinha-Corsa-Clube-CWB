using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LojinhaCorsa.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProductQuantityDiscounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "product_quantity_discounts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    product_id = table.Column<Guid>(type: "uuid", nullable: false),
                    minimum_quantity = table.Column<int>(type: "integer", nullable: false),
                    discount_per_unit = table.Column<decimal>(type: "numeric", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_product_quantity_discounts", x => x.id);
                    table.CheckConstraint("ck_product_quantity_discounts_discount_per_unit", "discount_per_unit > 0");
                    table.CheckConstraint("ck_product_quantity_discounts_minimum_quantity", "minimum_quantity >= 2");
                    table.ForeignKey(
                        name: "FK_product_quantity_discounts_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_product_quantity_discounts_product_id_minimum_quantity",
                table: "product_quantity_discounts",
                columns: new[] { "product_id", "minimum_quantity" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "product_quantity_discounts");
        }
    }
}
