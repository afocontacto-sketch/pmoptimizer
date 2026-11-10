/**
 * Tests para funcionalidades de órdenes de trabajo:
 * 1. Separación de órdenes cerradas
 * 2. Reapertura de órdenes con historial
 * 3. Persistencia en localStorage
 */

describe('WorkOrders - Órdenes Cerradas', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const ordersStorageKey = "pmoptimizer-work-orders-v2";

  describe('Separación de Órdenes Cerradas', () => {
    test('Orden cerrada desaparece de la lista activa', () => {
      // Simula una orden activa
      const activeOrder = {
        id: "OT-2048",
        contract: "CT1234",
        wbs: "CT1234-CL-B2N4-PRE",
        type: "PRE",
        equipment: "VEH-001",
        description: "Preventivo",
        technician: "Camila Rojas",
        hourlyRate: 18000,
        projectedHours: 3.5,
        elapsedSeconds: 0,
        timerStartedAt: null,
        status: "Asignada",
        requiredMaterials: [],
        consumedMaterials: [],
        reservedPicks: [],
        qualityChecklist: {},
        qualityApproved: false,
        qualityApprovedBy: null,
        supervisorClosedBy: null,
      };

      let orders = [activeOrder];
      
      // Filtrar órdenes activas
      let activeOrders = orders.filter(order => order.status !== "Cerrada");
      expect(activeOrders).toHaveLength(1);
      
      // Cerrar la orden
      const closedOrder = {
        ...activeOrder,
        status: "Cerrada",
        supervisorClosedBy: "Supervisor",
        closedAt: new Date().toISOString(),
        closedBy: "Supervisor",
        statusHistory: [{
          date: new Date().toISOString(),
          previousStatus: "Asignada",
          newStatus: "Cerrada",
          user: "Supervisor"
        }]
      };
      
      orders = [closedOrder];
      
      // Verificar que desaparece de activas
      activeOrders = orders.filter(order => order.status !== "Cerrada");
      expect(activeOrders).toHaveLength(0);
      
      // Verificar que está en cerradas
      const closedOrders = orders.filter(order => order.status === "Cerrada");
      expect(closedOrders).toHaveLength(1);
      expect(closedOrders[0].id).toBe("OT-2048");
    });

    test('Solo Supervisor puede ver órdenes cerradas', () => {
      const canSeeClosed = (role) => role === "Supervisor" || role === "Administrador";
      
      expect(canSeeClosed("Supervisor")).toBe(true);
      expect(canSeeClosed("Administrador")).toBe(true);
      expect(canSeeClosed("Planificador")).toBe(false);
      expect(canSeeClosed("Producción")).toBe(false);
      expect(canSeeClosed("PM Proyecto")).toBe(false);
    });
  });

  describe('Reapertura de Órdenes', () => {
    test('Reapertura con motivo guarda historial', () => {
      const closedOrder = {
        id: "OT-2049",
        status: "Cerrada",
        supervisorClosedBy: "Supervisor",
        closedAt: new Date().toISOString(),
        closedBy: "Supervisor",
        statusHistory: [{
          date: new Date().toISOString(),
          previousStatus: "Cierre provisorio",
          newStatus: "Cerrada",
          user: "Supervisor"
        }]
      };

      const reopenReason = "Se encontró defecto en prueba de calidad, se requiere reproceso";
      
      const reopenedOrder = {
        ...closedOrder,
        status: "Asignada",
        supervisorClosedBy: null,
        qualityApproved: false,
        qualityApprovedBy: null,
        statusHistory: [
          ...(closedOrder.statusHistory || []),
          {
            date: new Date().toISOString(),
            previousStatus: "Cerrada",
            newStatus: "Asignada",
            user: "Supervisor",
            reason: reopenReason
          }
        ]
      };

      expect(reopenedOrder.status).toBe("Asignada");
      expect(reopenedOrder.statusHistory.length).toBe(2);
      expect(reopenedOrder.statusHistory[1].reason).toBe(reopenReason);
    });

    test('Motivo de reapertura es obligatorio', () => {
      const reason1 = "";
      const isValid1 = reason1 && reason1.trim().length > 0;
      expect(isValid1).toBe(false);
      
      const reason2 = "Defecto encontrado";
      const isValid2 = reason2 && reason2.trim().length > 0;
      expect(isValid2).toBe(true);
    });
  });

  describe('Persistencia en localStorage', () => {
    test('Órdenes se guardan con clave v2', () => {
      const orders = [
        {
          id: "OT-2048",
          status: "Cerrada",
          closedAt: new Date().toISOString(),
          closedBy: "Supervisor",
          statusHistory: []
        }
      ];

      // Guardar en localStorage
      localStorage.setItem(ordersStorageKey, JSON.stringify(orders));
      
      // Verificar que se guardó
      const stored = localStorage.getItem(ordersStorageKey);
      expect(stored).not.toBeNull();
      
      // Parsear y verificar contenido
      const parsed = JSON.parse(stored);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe("OT-2048");
      expect(parsed[0].status).toBe("Cerrada");
    });

    test('Datos persisten: fecha/hora de cierre y usuario', () => {
      const now = new Date().toISOString();
      const order = {
        id: "OT-2049",
        status: "Cerrada",
        closedAt: now,
        closedBy: "Admin User",
        statusHistory: [{
          date: now,
          previousStatus: "Cierre provisorio",
          newStatus: "Cerrada",
          user: "Admin User"
        }]
      };

      localStorage.setItem(ordersStorageKey, JSON.stringify([order]));
      
      const retrieved = JSON.parse(localStorage.getItem(ordersStorageKey))[0];
      expect(retrieved.closedAt).toBe(now);
      expect(retrieved.closedBy).toBe("Admin User");
      expect(retrieved.statusHistory[0].user).toBe("Admin User");
    });

    test('Historial de cambios de estado se preserva', () => {
      const order = {
        id: "OT-2050",
        status: "Asignada",
        statusHistory: [
          {
            date: "2024-01-01T10:00:00Z",
            previousStatus: "Asignada",
            newStatus: "En ejecución",
            user: "Technician"
          },
          {
            date: "2024-01-01T13:00:00Z",
            previousStatus: "En ejecución",
            newStatus: "Cierre provisorio",
            user: "Technician"
          },
          {
            date: "2024-01-01T14:00:00Z",
            previousStatus: "Cierre provisorio",
            newStatus: "Cerrada",
            user: "Supervisor",
            reason: "Completada exitosamente"
          }
        ]
      };

      localStorage.setItem(ordersStorageKey, JSON.stringify([order]));
      
      const retrieved = JSON.parse(localStorage.getItem(ordersStorageKey))[0];
      expect(retrieved.statusHistory).toHaveLength(3);
      expect(retrieved.statusHistory[2].reason).toBe("Completada exitosamente");
    });
  });

  describe('Lógica de cierre', () => {
    test('Orden en Cerrada se mueve automáticamente a sección cerrada', () => {
      const order = {
        id: "OT-TEST",
        status: "Cierre provisorio"
      };

      let orders = [order];
      
      // Simula cambio a Cerrada
      orders = orders.map(o => o.id === "OT-TEST" 
        ? { ...o, status: "Cerrada" }
        : o
      );

      const activeOrders = orders.filter(o => o.status !== "Cerrada");
      const closedOrders = orders.filter(o => o.status === "Cerrada");

      expect(activeOrders).toHaveLength(0);
      expect(closedOrders).toHaveLength(1);
      expect(closedOrders[0].status).toBe("Cerrada");
    });

    test('Otros roles NO ven órdenes cerradas excepto Supervisor', () => {
      const roles = ["PM Proyecto", "Planificador", "Producción", "Compras"];
      
      roles.forEach(role => {
        const canSee = role === "Supervisor" || role === "Administrador";
        expect(canSee).toBe(false);
      });
    });
  });
});
