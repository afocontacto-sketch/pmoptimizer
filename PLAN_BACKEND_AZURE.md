# 🔗 PLAN: Backend Azure SQL + Node.js para PMOptimizer

**Objetivo:** Datos compartidos entre usuarios (no solo localStorage)

---

## 📋 ARQUITECTURA

```
Frontend (React/GitHub Pages)
        ↓
  API REST (Node.js + Express)
        ↓
  Azure SQL Database
        ↓
Datos compartidos entre usuarios ✅
```

---

## 🚀 FASES

### **FASE 1: Backend básico (30 min)**
- [ ] Crear servidor Node.js + Express
- [ ] Conectar a Azure SQL
- [ ] 3 endpoints:
  - `POST /api/ordenes` - Crear orden
  - `GET /api/ordenes` - Listar órdenes
  - `GET /api/ordenes/:id` - Detalle

### **FASE 2: Migrar datos (20 min)**
- [ ] Reemplazar localStorage con fetch() en React
- [ ] Sincronizar órdenes desde BD

### **FASE 3: Autenticación (opcional, 15 min)**
- [ ] Login básico (usuario/contraseña)
- [ ] JWT tokens
- [ ] Cada usuario ve sus datos

### **FASE 4: Deploy (10 min)**
- [ ] Publicar backend en Azure App Service
- [ ] Configurar CORS
- [ ] App en GitHub Pages + Backend en Azure

---

## 💾 TABLAS INICIALES

```sql
-- Órdenes
CREATE TABLE ordenes (
  id INT PRIMARY KEY IDENTITY,
  numero_orden VARCHAR(20) UNIQUE,
  tipo VARCHAR(10),
  estado VARCHAR(20),
  titulo VARCHAR(100),
  descripcion TEXT,
  fecha_creacion DATETIME DEFAULT GETDATE(),
  usuario_id INT,
  datos JSON
);

-- Usuarios (si quieres login)
CREATE TABLE usuarios (
  id INT PRIMARY KEY IDENTITY,
  username VARCHAR(50) UNIQUE,
  email VARCHAR(100),
  password_hash VARCHAR(255),
  fecha_registro DATETIME DEFAULT GETDATE()
);
```

---

## 🎯 ¿EMPEZAMOS CON FASE 1?

Te voy a:
1. Generar código Node.js completo
2. Instrucciones para Azure SQL
3. Conectar la app React

¿LISTO? ✅
