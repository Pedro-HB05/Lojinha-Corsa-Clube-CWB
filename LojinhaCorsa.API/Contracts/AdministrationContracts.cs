using System.ComponentModel.DataAnnotations;

namespace LojinhaCorsa.API.Contracts;

public sealed record GrantAdministratorRequest(
    [Required, EmailAddress, MaxLength(320)] string Email);
