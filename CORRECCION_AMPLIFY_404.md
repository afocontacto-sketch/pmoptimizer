# 🔧 CORRECCIÓN: Error 404 en Amplify

**Problema:** `No se puede encontrar esta página (staging.d27msrwf1t0xmk.amplifyapp.com)`

**Causa:** El ZIP se subió con estructura incorrecta. Amplify buscaba `index.html` en la raíz pero estaba dentro de una carpeta.

---

## ✅ SOLUCIÓN RÁPIDA (2 minutos)

### **Paso 1: Ir a Amplify Console**
https://amplify.aws.amazon.com/

### **Paso 2: Buscar tu app**
Nombre: `pmoptimizer-demo` (o similar)

### **Paso 3: Ir a "Deployments"**
- Haz clic en **"Deployments"** en el menú izquierdo

### **Paso 4: Subir nuevamente**
- Clic en **"Deploy"** o **"Upload"**
- **Opción A (Recomendado):** Arrastra la carpeta `dist/` completa
  - Selecciona TODO dentro de `dist/`:
    - `index.html`
    - `assets/`
    - `favicon.svg`
    - `icons.svg`
    - `logo-pmoptimizer.jpg`
  - Arrastra directamente a Amplify
  
- **Opción B:** Usa el nuevo ZIP corregido
  - Archivo: `pmoptimizer-build-correcto.zip`
  - Este ZIP contiene SOLO el contenido de `dist/`, no la carpeta

### **Paso 5: Esperar despliegue**
- Amplify procesará los archivos (2-5 minutos)
- Cuando termine, recargará la página automáticamente

---

## 📂 Estructura Correcta

❌ **INCORRECTO** (lo que causó el error):
```
ZIP
└── dist/
    ├── index.html
    ├── assets/
    └── ...
```

✅ **CORRECTO** (lo que necesita Amplify):
```
ZIP (o carpeta)
├── index.html
├── assets/
├── favicon.svg
└── ...
```

---

## 🎯 Resumen

| Acción | Archivo |
|--------|---------|
| **Re-subir en Amplify** | Carpeta `dist/` completa (contenido, no la carpeta) |
| **O** | `pmoptimizer-build-correcto.zip` |
| **URL esperada** | `https://main.xxxxxxxxxxxx.amplifyapp.com` |

---

## ✅ Validación Post-Despliegue

Una vez que se recargue:
- [ ] URL carga sin error 404
- [ ] Logo PMOptimizer visible
- [ ] Menú funcional
- [ ] Puedo hacer login

---

**Cuéntame cuando lo re-subes y toma una captura de la app funcionando.** 📸

