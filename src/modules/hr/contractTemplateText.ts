// Plantilla de contrato individual de trabajo v1 (abogado-contrato-trabajo-1.txt, 10-11-2026). Texto sujeto a validación de un abogado habilitado.
export const contractTemplateText = `
                     CONTRATO INDIVIDUAL DE TRABAJO
                     {{#si indefinido}}(PLAZO INDEFINIDO){{/si}}{{#si plazoFijo}}(PLAZO FIJO){{/si}}{{#si obraFaena}}(POR OBRA O FAENA){{/si}}
                     N° {{contrato.numero}}

En {{ciudadFecha}}, entre {{empresa.razonSocial}}, RUT {{empresa.rut}}, giro {{empresa.giro}},
representada legalmente por don(ña) {{empresa.representante}}, cédula de identidad
N° {{empresa.representanteRut}}, ambos con domicilio en {{empresa.domicilio}}, correo
electrónico {{empresa.correo}}, en adelante el "Empleador"; y don(ña) {{trabajador.nombre}},
cédula de identidad N° {{trabajador.rut}}, de nacionalidad {{trabajador.nacionalidad}}, nacido(a)
el {{trabajador.fechaNacimiento}}, de estado civil {{trabajador.estadoCivil}}, con domicilio en
{{trabajador.domicilio}}, correo electrónico {{trabajador.correo}}, en adelante el
"Trabajador", se ha convenido el siguiente contrato individual de trabajo:

PRIMERO: NATURALEZA DE LOS SERVICIOS.
El Trabajador se obliga a prestar servicios personales bajo subordinación y dependencia del
Empleador en el cargo de {{cargo}}, con las siguientes funciones:
{{funciones}}
{{#si tieneFuncionesAlternativas}}
Conforme al artículo 10 N°3 del Código del Trabajo, las partes acuerdan además las siguientes
funciones alternativas o complementarias: {{funcionesAlternativas}}.
{{/si}}
Asimismo, el Trabajador realizará las labores conexas o complementarias a su cargo que le
encomiende el Empleador, siempre que sean de naturaleza similar y no menoscaben su dignidad,
conforme al artículo 12 del Código del Trabajo.

SEGUNDO: LUGAR DE PRESTACIÓN DE LOS SERVICIOS.
Los servicios se prestarán en {{lugarTrabajo}}, comuna de {{lugarTrabajoComuna}}, ciudad de
{{lugarTrabajoCiudad}}, sin perjuicio de que el Empleador pueda modificar el sitio o recinto
dentro de la misma ciudad en los términos del artículo 12 del Código del Trabajo.
{{#si requiereDesplazamiento}}
Como la naturaleza de los servicios exige desplazamientos, se entiende por lugar de trabajo toda
la zona geográfica que comprende la actividad de la empresa, en particular: {{zonaGeografica}}
(artículo 10, inciso final, del Código del Trabajo).
{{/si}}
{{#si cambioDomicilio}}
Se deja constancia de que, para celebrar este contrato, el Trabajador cambia su domicilio. Su
lugar de procedencia es {{trabajador.lugarProcedencia}} (artículo 10, inciso tercero, del Código
del Trabajo).
{{/si}}
{{#si teletrabajo}}
Las partes pactan la modalidad de {{teletrabajoModalidad}} (trabajo a distancia o
teletrabajo, total o parcial), regulada por la Ley N° 21.220 y los artículos 152 quáter G y
siguientes del Código del Trabajo. El detalle (lugar, distribución presencial/remota, equipos,
costos de operación, derecho a desconexión de al menos 12 horas continuas en cada 24 horas,
reversibilidad y condiciones de seguridad) consta en el Anexo de Teletrabajo, que se firma en
este acto y forma parte integrante de este contrato.
{{/si}}

TERCERO: JORNADA DE TRABAJO.
{{#si jornadaOrdinaria}}
El Trabajador cumplirá una jornada ordinaria de {{horasSemanales}} horas semanales, distribuida
en {{diasPorSemana}} días, de la siguiente forma: {{distribucionJornada}}.
{{/si}}
{{#si jornadaParcial}}
El Trabajador cumplirá una jornada a tiempo parcial de {{horasSemanales}} horas semanales,
distribuida en {{diasPorSemana}} días, de la siguiente forma: {{distribucionJornada}}, conforme
a los artículos 40 bis y siguientes del Código del Trabajo.
{{/si}}
{{#si jornadaConColacion}}
La jornada se interrumpe con un descanso de {{colacionMinutos}} minutos para colación, que no
se considera trabajado para computar la duración de la jornada (artículo 34 del Código del
Trabajo).
{{/si}}
{{#si jornadaExcluida}}
Dada la naturaleza de sus funciones, que se describen en la cláusula primera, el Trabajador queda
excluido de la limitación de jornada conforme al artículo 22, inciso segundo, del Código del
Trabajo, porque {{fundamentoExclusion}}. Esta exclusión no lo priva de los descansos legales.
{{/si}}
{{#si jornadaLimitada}}
La jornada se ajustará a los límites máximos que fija la ley en cada momento, en particular a la
reducción a 40 horas semanales desde el 26 de abril de 2028 que dispone la Ley N° 21.561, sin
rebaja de la remuneración. La nueva distribución se acordará por escrito o, a falta de acuerdo,
se aplicarán las reglas supletorias legales.

La asistencia y las horas trabajadas se registrarán mediante {{sistemaControlAsistencia}},
conforme al artículo 33 del Código del Trabajo y a la normativa de la Dirección del Trabajo.

Solo se podrán trabajar horas extraordinarias para atender necesidades o situaciones temporales
de la empresa, con un máximo de dos horas por día y mediante un pacto escrito de vigencia no
superior a tres meses, renovable. Se pagarán con el recargo legal del 50% sobre el sueldo
convenido para la jornada ordinaria y se liquidarán junto con las remuneraciones del período.
Las partes podrán acordar por escrito compensarlas con días adicionales de feriado, en los
términos y límites del artículo 32 del Código del Trabajo.
{{/si}}

CUARTO: REMUNERACIÓN.
El Empleador pagará al Trabajador las siguientes remuneraciones:
a) Sueldo base mensual: {{sueldoBase}} ({{sueldoBaseEnPalabras}}){{#si jornadaParcial}}, que no
   será inferior al ingreso mínimo mensual en proporción a la jornada pactada{{/si}}.
b) Gratificación legal:
{{#si gratificacionArt50}}
   El Empleador se acoge al artículo 50 del Código del Trabajo y pagará el 25% de lo devengado
   en el ejercicio por concepto de remuneraciones mensuales, con tope de 4,75 ingresos mínimos
   mensuales al año. Se pagará anticipadamente en cuotas mensuales de un doceavo del tope y se
   liquidará en forma proporcional si el contrato termina antes del cierre del ejercicio.
{{/si}}
{{#si gratificacionArt47}}
   El Empleador pagará la gratificación del artículo 47 del Código del Trabajo, de al menos el
   30% de la utilidad líquida del ejercicio, distribuida en proporción a lo devengado por cada
   trabajador, con los anticipos que se acuerden.
{{/si}}
{{#si gratificacionConvencional}}
   Las partes pactan la siguiente gratificación convencional: {{gratificacionTexto}}. Esta
   gratificación no podrá ser inferior a la legal (artículo 46 del Código del Trabajo).
{{/si}}
{{#si tieneOtrosHaberes}}
c) Otros haberes: {{otrosHaberes}}.
{{/si}}
{{#si tieneAsignacionesNoImponibles}}
d) Asignaciones no imponibles (artículo 41, inciso segundo, del Código del Trabajo), que no
   constituyen remuneración: {{asignacionesNoImponibles}}.
{{/si}}
{{#si beneficiosEspecie}}
e) Beneficios adicionales en especie o servicios (artículo 10, inciso segundo, del Código del
   Trabajo): {{beneficiosEspecieTexto}}.
{{/si}}

Las remuneraciones se pagarán por períodos {{periodoPago}}, a más tardar el día {{diaPago}} del
mes siguiente al trabajado (o el día hábil anterior, si ese día es inhábil), mediante
{{formaPago}}{{#si pagoTransferencia}} a la cuenta N° {{cuentaNumero}} del {{banco}}, de
titularidad del Trabajador{{/si}}. El período de pago nunca podrá ser superior a un mes
(artículo 44 del Código del Trabajo). Junto con el pago, el Empleador entregará un comprobante
con el detalle de los montos pagados y de los descuentos efectuados (artículo 54 bis del Código
del Trabajo).
{{#si tieneReajuste}}
La remuneración se reajustará así: {{reajusteTexto}}.
{{/si}}

QUINTO: DESCUENTOS Y PREVISIÓN.
El Empleador descontará de las remuneraciones los impuestos, las cotizaciones de seguridad
social y los demás descuentos legales (artículo 58 del Código del Trabajo). El Trabajador declara
estar afiliado a:
- Sistema de pensiones: {{afp}}.
- Salud: {{salud}}{{#si isapre}}, con un plan pactado de {{planIsapreUF}} UF mensuales. El
  Trabajador autoriza a descontar la diferencia entre el 7% legal y el valor del plan{{/si}}.
- Seguro de cesantía de la Ley N° 19.728, según el tipo de contrato.
- Organismo administrador de la Ley N° 16.744: {{empresa.mutualidad}}.
{{#si tieneCajaCompensacion}}
- Caja de Compensación de Asignación Familiar: {{empresa.cajaCompensacion}}.
{{/si}}
Solo se harán otros descuentos con autorización escrita del Trabajador y dentro de los límites
del artículo 58 del Código del Trabajo.

SEXTO: OBLIGACIONES Y PROHIBICIONES.
El Trabajador cumplirá las instrucciones que, dentro de sus funciones, le imparta el Empleador
o sus representantes, y respetará el Reglamento Interno de Orden, Higiene y Seguridad (cuando
exista), las normas de prevención de riesgos y las políticas de la empresa que se le comuniquen
por escrito. Las sanciones disciplinarias son las previstas en el Reglamento Interno, dentro de
los límites del artículo 154 N°10 del Código del Trabajo. Este contrato no contiene multas
distintas de esas.

SÉPTIMO: FERIADO.
El Trabajador tendrá derecho a un feriado anual remunerado de 15 días hábiles después de un año
de servicio, además del feriado progresivo que corresponda conforme a los artículos 67 y
siguientes del Código del Trabajo.

OCTAVO: PREVENCIÓN DEL ACOSO Y LA VIOLENCIA EN EL TRABAJO (LEY N° 21.643, "LEY KARIN").
El Empleador cuenta con un Protocolo de Prevención del Acoso Sexual, el Acoso Laboral y la
Violencia en el Trabajo, y con un procedimiento de investigación y sanción de estas conductas,
conforme a los artículos 2, 154 N°12, 154 bis y 211-A y siguientes del Código del Trabajo. En este
acto el Trabajador recibe una copia del Protocolo (versión {{protocoloKarinVersion}}, de fecha
{{protocoloKarinFecha}}) y declara conocerlo.
{{#si sinReglamentoInterno}}
Como el Empleador no está obligado a tener Reglamento Interno de Orden, Higiene y Seguridad, se
deja constancia escrita, conforme al artículo 154 bis del Código del Trabajo, de que el Protocolo
y el procedimiento de investigación y sanción se ponen en conocimiento del Trabajador al
suscribir este contrato y se incorporan al reglamento del artículo 67 de la Ley N° 16.744.
{{/si}}
Las denuncias pueden presentarse por escrito o verbalmente ante el Empleador, a través de
{{canalDenunciaKarin}}, o directamente ante la Dirección del Trabajo. El Empleador garantiza la
confidencialidad de las denuncias, la adopción de medidas de resguardo y la prohibición de
represalias. Las partes declaran que las relaciones laborales deben fundarse en un trato
compatible con la dignidad de la persona y libre de violencia.

NOVENO: SEGURIDAD Y SALUD EN EL TRABAJO.
El Trabajador declara haber recibido información sobre los riesgos de su puesto, las medidas
preventivas y los métodos de trabajo correctos, conforme a la Ley N° 16.744 y al D.S. N° 44 de
2024 del Ministerio del Trabajo y Previsión Social. Se compromete a usar los elementos de
protección personal que se le entreguen sin costo para él.

DÉCIMO: CONFIDENCIALIDAD.
Durante la vigencia del contrato y después de su término, el Trabajador mantendrá en reserva la
información confidencial del Empleador, de sus clientes y de sus proveedores a la que acceda con
motivo de sus funciones: información técnica, comercial, financiera, de procesos, de software,
de precios y de datos personales. Esta obligación no se extiende a la información pública ni a
la que deba revelarse por mandato legal o judicial. Su incumplimiento podrá configurar la
causal del artículo 160 del Código del Trabajo que corresponda, sin perjuicio de las acciones
civiles y penales.

{{#si propiedadIntelectual}}
DÉCIMO BIS: PROPIEDAD INTELECTUAL E INDUSTRIAL.
Los programas computacionales, diseños, documentos, bases de datos, invenciones y demás obras
o creaciones que el Trabajador desarrolle en el ejercicio de sus funciones, o con medios del
Empleador, pertenecen a este último, conforme al artículo 8 de la Ley N° 17.336 y a la Ley
N° 19.039, sin que corresponda una remuneración adicional a la pactada en este contrato. Se
respetarán los derechos morales que la ley reconoce al autor.
{{/si}}

UNDÉCIMO: PROTECCIÓN DE DATOS PERSONALES.
1. Responsable: {{empresa.razonSocial}}, RUT {{empresa.rut}}. Contacto para materias de datos
   personales: {{empresa.correoDatos}}{{#si tieneDelegadoDatos}}; delegado de protección de datos:
   {{empresa.delegadoDatos}}{{/si}}.
2. Finalidades: gestionar la relación laboral; calcular y pagar las remuneraciones; cumplir las
   obligaciones laborales, previsionales, tributarias y de seguridad y salud en el trabajo;
   controlar la asistencia; administrar los accesos a los sistemas; y cumplir los requerimientos
   de las autoridades.
3. Bases de licitud: la ejecución de este contrato y el cumplimiento de obligaciones legales del
   Empleador (Ley N° 19.628 y, desde su entrada en vigencia, arts. 12 y 13 de la Ley N° 19.628
   en el texto que fija la Ley N° 21.719). El Empleador no condicionará la relación laboral a
   que el Trabajador consienta tratamientos que no sean necesarios para ella.
4. Datos sensibles: los datos de salud (licencias médicas, accidentes, exámenes ocupacionales),
   de afiliación sindical y biométricos{{#si controlBiometrico}} (incluido el control de
   asistencia biométrico, para el que se adoptarán medidas reforzadas de seguridad y se
   ofrecerá una alternativa cuando corresponda){{/si}} se tratarán solo cuando la ley lo
   autorice o lo exija, y con medidas reforzadas de seguridad.
5. Destinatarios: AFP, FONASA o Isapre, IPS, AFC, Servicio de Impuestos Internos, Dirección del
   Trabajo, organismo administrador de la Ley N° 16.744, Previred, bancos pagadores y los
   proveedores tecnológicos que actúen como encargados de tratamiento por cuenta del Empleador,
   con quienes existirá un contrato con resguardos de seguridad y confidencialidad.
   {{#si transferenciaInternacional}}Algunos datos se alojan en servidores ubicados en
   {{paisesTransferencia}}, con las garantías que exige la ley.{{/si}}
6. Conservación: durante la vigencia del contrato y, después, por el plazo necesario para cumplir
   obligaciones legales o defenderse de acciones legales (prescripción). Luego se eliminarán o
   anonimizarán.
7. Derechos: el Trabajador puede ejercer los derechos de acceso, rectificación, supresión,
   oposición, portabilidad y bloqueo, y no ser objeto de decisiones basadas únicamente en
   tratamiento automatizado, escribiendo a {{empresa.correoDatos}}. También puede reclamar ante
   la autoridad competente.
8. El Empleador mantendrá reserva de toda la información y de los datos privados del Trabajador
   a los que acceda con motivo de la relación laboral (artículo 154 ter del Código del Trabajo).
9. Por su parte, el Trabajador tratará los datos personales a los que acceda en sus funciones
   solo según las instrucciones y políticas del Empleador.

DUODÉCIMO: DURACIÓN DEL CONTRATO.
El Trabajador ingresa a prestar servicios el {{fechaInicio}}.
{{#si indefinido}}
Este contrato es de duración indefinida. Las partes podrán ponerle término por las causales de
los artículos 159, 160 y 161 del Código del Trabajo, con las formalidades de los artículos 162 y
siguientes y las indemnizaciones legales que correspondan.
{{/si}}
{{#si plazoFijo}}
Este contrato es a plazo fijo y vence el {{fechaTermino}} (artículo 159 N°4 del Código del
Trabajo). Si el Trabajador sigue prestando servicios después del vencimiento con conocimiento
del Empleador, o si el contrato se renueva por segunda vez, pasará a ser de duración
indefinida. Durante su vigencia, también podrá terminar por las demás causales legales.
{{/si}}
{{#si obraFaena}}
Este contrato es por obra o faena determinada (artículo 10 bis del Código del Trabajo). La obra
o faena es: {{obraDescripcion}}{{#si obraTieneFechaEstimada}}, cuya fecha estimada de término
es el {{obraFechaEstimadaTermino}}{{/si}}. El contrato terminará al concluir la obra o faena
(artículo 159 N°5), lo que se comunicará conforme al artículo 162. Si el contrato duró más de un
mes, se pagará la indemnización por tiempo servido del artículo 163 del Código del Trabajo. Las
partes dejan constancia de que la obra no corresponde a labores permanentes de la empresa.
{{/si}}

{{#si esExtranjero}}
DECIMOTERCERO: TRABAJADOR EXTRANJERO.
El Trabajador declara tener en Chile {{trabajador.tipoPermisoMigratorio}} vigente, que lo habilita
para trabajar, hasta el {{trabajador.vencimientoPermiso}} (Ley N° 21.325). Se obliga a mantenerlo
vigente y a informar al Empleador de cualquier cambio. El Empleador cumplirá las obligaciones
que la ley migratoria le impone como empleador. Este contrato no contiene condiciones distintas
de las que rigen para los trabajadores chilenos que ocupan el mismo cargo.
{{/si}}

DECIMOCUARTO: DOMICILIO Y COMUNICACIONES.
Para todos los efectos de este contrato, las partes fijan domicilio en la ciudad de
{{empresa.ciudad}}. Las comunicaciones laborales podrán enviarse a los correos electrónicos
indicados en la comparecencia, sin perjuicio de las formalidades que la ley exige para ciertos
avisos. Cualquier controversia será conocida por los Juzgados de Letras del Trabajo competentes,
conforme a las reglas del Código del Trabajo.

DECIMOQUINTO: DOCUMENTOS RECIBIDOS Y EJEMPLARES.
El Trabajador declara recibir en este acto: (i) un ejemplar de este contrato; (ii) el
Protocolo de Prevención de la Ley Karin; {{#si tieneReglamentoInterno}}(iii) el Reglamento
Interno de Orden, Higiene y Seguridad; {{/si}}{{#si sinReglamentoInterno}}(iii) el reglamento
del artículo 67 de la Ley N° 16.744; {{/si}}y (iv) la información sobre los riesgos laborales
de su puesto. {{#si teletrabajo}}Recibe además el Anexo de Teletrabajo. {{/si}}Este contrato se
firma en dos ejemplares, {{#si firmaElectronica}}mediante firma electrónica, {{/si}}quedando
uno en poder de cada parte (artículo 9 del Código del Trabajo).


_______________________________            _______________________________
{{empresa.representante}}                    {{trabajador.nombre}}
p.p. {{empresa.razonSocial}}                 RUT {{trabajador.rut}}
RUT {{empresa.rut}}                          TRABAJADOR
EMPLEADOR

Fecha de firma: {{fechaFirma}}
`;
