using System.ComponentModel.DataAnnotations;

namespace LojinhaCorsa.API.Contracts;

public sealed record PixSettingRequest([Required, MaxLength(255)] string PixKey,
    [Required] string KeyType, [Required, MaxLength(180)] string BeneficiaryName,
    [MaxLength(100)] string? BeneficiaryCity, string? Instructions);
