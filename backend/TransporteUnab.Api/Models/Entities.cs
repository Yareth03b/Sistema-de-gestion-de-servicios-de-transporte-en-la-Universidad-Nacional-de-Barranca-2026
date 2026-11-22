using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace TransporteUnab.Api.Models;

[Table("Rol")]
public class Rol
{
    [Key] public int id_rol { get; set; }
    [Required, MaxLength(50)] public string nombre_rol { get; set; } = string.Empty;
}

[Table("Usuario")]
public class Usuario
{
    [Key] public int id_usuario { get; set; }
    public int id_rol { get; set; }
    [Required, MaxLength(80)] public string nombres { get; set; } = string.Empty;
    [Required, MaxLength(80)] public string apellidos { get; set; } = string.Empty;
    [Required, MaxLength(50)] public string nombre_usuario { get; set; } = string.Empty;
    [Required, MaxLength(256)] public string contrasenia { get; set; } = string.Empty;
    public bool activo { get; set; } = true;

    [ForeignKey(nameof(id_rol)), JsonIgnore] public Rol? Rol { get; set; }
}

[Table("UnidadTransporte")]
public class UnidadTransporte
{
    [Key] public int id_unidad { get; set; }
    public int? id_usuario { get; set; }
    [Required, MaxLength(10)] public string placa { get; set; } = string.Empty;
    [Required, MaxLength(30)] public string tipo { get; set; } = string.Empty;
    [Required, MaxLength(50)] public string marca { get; set; } = string.Empty;
    [Required, MaxLength(50)] public string modelo { get; set; } = string.Empty;
    [MaxLength(30)] public string? codigo_patrimonial { get; set; }
    public int? capacidad { get; set; }
    [MaxLength(20)] public string? estado { get; set; }
    public bool activo { get; set; } = true;
}

[Table("Conductor")]
public class Conductor
{
    [Key] public int id_conductor { get; set; }
    public int? id_unidad { get; set; }
    [Required, MaxLength(8)] public string dni { get; set; } = string.Empty;
    [Required, MaxLength(80)] public string nombres { get; set; } = string.Empty;
    [Required, MaxLength(80)] public string apellidos { get; set; } = string.Empty;
    [MaxLength(15)] public string? brevete { get; set; }
    public bool activo { get; set; } = true;

    [ForeignKey(nameof(id_unidad)), JsonIgnore] public UnidadTransporte? Unidad { get; set; }
}

[Table("AreaSolicitante")]
public class AreaSolicitante
{
    [Key] public int id_area { get; set; }
    [Required, MaxLength(100)] public string nombre { get; set; } = string.Empty;
}

[Table("Ruta")]
public class Ruta
{
    [Key] public int id_ruta { get; set; }
    [Required, MaxLength(100)] public string punto_salida { get; set; } = string.Empty;
    [Required, MaxLength(100)] public string punto_llegada { get; set; } = string.Empty;
    public int km_referencia { get; set; }
}

[Table("BitacoraTurno")]
public class BitacoraTurno
{
    [Key] public int id_turno { get; set; }
    public int id_unidad { get; set; }
    public int id_conductor { get; set; }
    public DateTime fecha { get; set; }
    public TimeSpan hora_salida { get; set; }
    public TimeSpan hora_llegada { get; set; }
    public int km_inicial { get; set; }
    public int km_final { get; set; }
    [DatabaseGenerated(DatabaseGeneratedOption.Computed)]
    public int km_recorridos { get; private set; }
    [MaxLength(300)] public string? observaciones { get; set; }

    [ForeignKey(nameof(id_unidad)), JsonIgnore] public UnidadTransporte? Unidad { get; set; }
    [ForeignKey(nameof(id_conductor)), JsonIgnore] public Conductor? Conductor { get; set; }
}

[Table("TurnoRuta")]
public class TurnoRuta
{
    [Key] public int id_turno_ruta { get; set; }
    public int id_turno { get; set; }
    public int id_ruta { get; set; }

    [ForeignKey(nameof(id_turno)), JsonIgnore] public BitacoraTurno? Turno { get; set; }
    [ForeignKey(nameof(id_ruta)), JsonIgnore] public Ruta? Ruta { get; set; }
}

[Table("Abastecimiento")]
public class Abastecimiento
{
    [Key] public int id_abastecimiento { get; set; }
    public int id_unidad { get; set; }
    public int id_conductor { get; set; }
    public int? id_area { get; set; }
    [Required, MaxLength(20)] public string nro_vale { get; set; } = string.Empty;
    public DateTime fecha { get; set; }
    public int km_actual { get; set; }
    [Column(TypeName = "decimal(8,2)")] public decimal galones { get; set; }
    [Required, MaxLength(20)] public string tipo_combustible { get; set; } = string.Empty;
    [MaxLength(300)] public string? observaciones { get; set; }

    [ForeignKey(nameof(id_unidad)), JsonIgnore] public UnidadTransporte? Unidad { get; set; }
    [ForeignKey(nameof(id_conductor)), JsonIgnore] public Conductor? Conductor { get; set; }
    [ForeignKey(nameof(id_area)), JsonIgnore] public AreaSolicitante? Area { get; set; }
}

[Table("CierreTrimestral")]
public class CierreTrimestral
{
    [Key] public int id_cierre { get; set; }
    public short anio { get; set; }
    public byte trimestre { get; set; }
    public DateTime fecha_cierre { get; set; }
}

[Table("CierreUnidad")]
public class CierreUnidad
{
    [Key] public int id_cierre_unidad { get; set; }
    public int id_cierre { get; set; }
    public int id_unidad { get; set; }
    public int km_recorridos { get; set; }
    [Column(TypeName = "decimal(10,2)")] public decimal galones { get; set; }
    [Column(TypeName = "decimal(8,2)")] public decimal? rendimiento { get; set; }
    public int km_acumulado { get; set; }
}

[Table("ReporteGrifo")]
public class ReporteGrifo
{
    [Key] public int id_reporte { get; set; }
    public short anio { get; set; }
    public byte trimestre { get; set; }
    [Column(TypeName = "decimal(10,2)")] public decimal galones_total { get; set; }
    [MaxLength(300)] public string? observaciones { get; set; }
}

[Table("Mantenimiento")]
public class Mantenimiento
{
    [Key] public int id_mantenimiento { get; set; }
    public int id_unidad { get; set; }
    public DateTime fecha { get; set; }
    public int km { get; set; }
    [Required, MaxLength(20)] public string tipo { get; set; } = string.Empty;
    [MaxLength(300)] public string? detalle { get; set; }
    [MaxLength(260)] public string? foto { get; set; }
    /// <summary>Fecha de salida del taller. NULL = el bus sigue en taller. fecha = ingreso.</summary>
    public DateTime? fecha_salida { get; set; }
}

[Table("DocumentoUnidad")]
public class DocumentoUnidad
{
    [Key] public int id_documento { get; set; }
    public int id_unidad { get; set; }
    [Required, MaxLength(20)] public string tipo { get; set; } = string.Empty;
    [Required, MaxLength(30)] public string numero { get; set; } = string.Empty;
    public DateTime fecha_vencimiento { get; set; }
}

[Table("Incidente")]
public class Incidente
{
    [Key] public int id_incidente { get; set; }
    public int id_unidad { get; set; }
    public DateTime fecha { get; set; }
    [Required, MaxLength(300)] public string descripcion { get; set; } = string.Empty;
}

[Table("EstimacionViaje")]
public class EstimacionViaje
{
    [Key] public int id_estimacion { get; set; }
    public int id_unidad { get; set; }
    public DateTime fecha { get; set; }
    [Required, MaxLength(100)] public string destino { get; set; } = string.Empty;
    public int distancia_km { get; set; }
    [Column(TypeName = "decimal(8,2)")] public decimal rendimiento_promedio { get; set; }
    [Column(TypeName = "decimal(8,2)")] public decimal precio_galon { get; set; }
    [Column(TypeName = "decimal(10,2)")] public decimal costo_estimado { get; set; }
}

[Table("RegistroSesion")]
public class RegistroSesion
{
    [Key] public int id_sesion { get; set; }
    public int id_usuario { get; set; }
    public DateTime fecha_hora_inicio { get; set; }
    public DateTime? fecha_hora_salida { get; set; }
}
