# 🚀 Despliegue Manual en AWS Amplify - PMOptimizer

**Fecha:** 2026-11-10  
**Método:** Despliegue manual (build pre-compilado)  
**Archivo:** `pmoptimizer-build.zip` (0.5 MB)

---

## ✅ Estado Actual

- ✅ Build compilado exitosamente: `npm run build`
- ✅ Archivos en carpeta `dist/`
- ✅ ZIP generado: `pmoptimizer-build.zip`
- ✅ App **Nueva** será creada en Amplify (no usa GitHub Actions)

---

## 📋 Paso a Paso

### **1. Acceder a AWS Amplify Console**

1. Ve a: https://amplify.aws.amazon.com/
2. Inicia sesión con tu cuenta AWS (005235464191)
3. Haz clic en **"Create app"** o **"New app"**

---

### **2. Crear Nueva App (Despliegue Manual)**

1. Selecciona **"Deploy without Git"** (no conectar GitHub)
2. Dale un nombre: **`pmoptimizer-demo`** (o el que prefieras)
3. Haz clic en **"Deploy"**

---

### **3. Subir Build Pre-compilado**

Después de crear la app, verás la opción **"Drag and drop a folder"** o un botón **"Choose files"**:

#### **Opción A: Drag and Drop**
- Abre la carpeta `dist/` en tu explorador de archivos
- Selecciona TODO dentro de `dist/` (incluyendo `index.html`, `assets/`, etc.)
- Arrastra y suelta en Amplify Console
- Espera a que se cargue (2-5 minutos)

#### **Opción B: Usar Amplify CLI (Recomendado)**

```powershell
cd "C:\Users\israel\OneDrive\proyecto software 1"

# 1. Configurar credenciales AWS (primera vez)
amplify configure

# 2. Inicializar Amplify en el proyecto
amplify init --name pmoptimizer-demo

# 3. Hacer push (sube el build a Amplify)
amplify publish
```

#### **Opción C: AWS CLI (Alternativa)**

```powershell
# Configurar AWS CLI con tus credenciales
aws configure

# Subir el ZIP a Amplify
aws amplify create-deployment \
  --app-id <APP_ID> \
  --branch-name main \
  --source-url file://pmoptimizer-build.zip
```

---

### **4. URL de la App**

Una vez desplegado, obtendrás una URL tipo:  
```
https://main.xxxxxxxxxxxx.amplifyapp.com
```

---

## 🔄 Actualizaciones Futuras

Cada vez que hagas cambios:

```powershell
# 1. Compilar nuevamente
npm run build

# 2. Generar ZIP
Compress-Archive -Path dist -DestinationPath pmoptimizer-build.zip -Force

# 3. Subir con Amplify CLI
amplify publish
```

O directamente desde Amplify Console:
- Ve a **"Deployments"**
- Haz clic en **"Deploy"**
- Arrastra el nuevo ZIP

---

## 📊 Información de la App

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | pmoptimizer-demo |
| **Tipo** | Despliegue manual |
| **Build** | Pre-compilado (Vite) |
| **Size** | ~1.6 MB gzipped |
| **Métodos de actualización** | Manual (Amplify Console, CLI o AWS CLI) |

---

## ⚠️ Notas Importantes

1. **Sin GitHub Actions:** Este despliegue no usa GitHub Actions, así que no se compilará automáticamente en Amplify
2. **Políticas SCP:** La app anterior (`d3s1baz52auids`) estaba bloqueada por políticas en el nivel de organización
3. **Múltiples Apps:** Puedes tener varias apps en Amplify. Esta es una nueva sin dependencias de rol
4. **Rollback:** Amplify mantiene historial de deployments, puedes hacer rollback desde Console

---

## 🐛 Troubleshooting

### **Error: "Build failed in Amplify Console"**
→ Verifica que solo suba archivos de `dist/`, no todo el proyecto

### **Error: "APP_ID not found"**
→ Primero crea la app en Amplify Console, luego obtén el APP_ID del dashboard

### **Error: "Access Denied" en AWS**
→ Verifica que tus credenciales AWS estén configuradas correctamente  
`aws configure` y proporciona:
- AWS Access Key ID
- AWS Secret Access Key
- Default region: `us-east-1` (o tu región)

---

## ✅ Validación

Una vez desplegado, abre la URL en tu navegador y verifica:
- ✅ Página carga correctamente
- ✅ Logo de PMOptimizer visible
- ✅ Menú funcional
- ✅ Inicio de sesión disponible

---

**¡Listo para publicar! 🎉**
