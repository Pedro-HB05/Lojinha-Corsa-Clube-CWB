using LojinhaCorsa.API.Contracts;
using LojinhaCorsa.API.Data;
using LojinhaCorsa.API.Domain;
using LojinhaCorsa.API.Infrastructure;
using LojinhaCorsa.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LojinhaCorsa.API.Controllers;

[ApiController, Route("api/pix"), Route("pix")]
public sealed class PixController(AppDbContext db, ICurrentUser currentUser, IAuditService audit) : ControllerBase
{
    [Authorize, HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var setting = await db.PixSettings.AsNoTracking().Where(x => x.IsActive)
            .Select(x => new { x.PixKey, x.KeyType, x.BeneficiaryName, x.BeneficiaryCity, x.Instructions })
            .SingleOrDefaultAsync(ct);
        return setting is null ? NotFound() : Ok(setting);
    }

    [Authorize(Roles = Roles.Administrator), HttpPut]
    public async Task<IActionResult> Set(PixSettingRequest request, CancellationToken ct)
    {
        var validTypes = new[] { "cpf", "cnpj", "email", "phone", "random" };
        if (!validTypes.Contains(request.KeyType)) throw new AppException(400, "Tipo de chave Pix inválido.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var now = DateTimeOffset.UtcNow;
        var active = await db.PixSettings.SingleOrDefaultAsync(x => x.IsActive, ct);
        if (active is not null) { active.IsActive = false; active.ValidUntil = now; active.UpdatedAt = now; active.UpdatedBy = currentUser.UserId; }
        var setting = new PixSetting { Id = Guid.NewGuid(), PixKey = request.PixKey.Trim(), KeyType = request.KeyType,
            BeneficiaryName = request.BeneficiaryName.Trim(), BeneficiaryCity = request.BeneficiaryCity?.Trim(),
            Instructions = request.Instructions?.Trim(), IsActive = true, ValidFrom = now, CreatedAt = now, UpdatedAt = now,
            CreatedBy = currentUser.UserId, UpdatedBy = currentUser.UserId };
        db.Add(setting); audit.Add("PixSetting", setting.Id, "PixSettingChanged");
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return NoContent();
    }
}
