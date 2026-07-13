# 🧬 BioVet OS - Contexto del Proyecto y Registro de Progreso

> **Para futuros asistentes de IA:** Lee detenidamente este documento antes de realizar cambios estructurales en el sistema. Contiene reglas de negocio clave, arquitectura y decisiones de diseño previas.

---

## 🛠 Tech Stack y Dependencias

- **Framework:** React 19 + Vite.
- **Lenguaje:** TypeScript (Estricto, se requiere tipado fuerte para despliegues en Netlify).
- **Estilos:** TailwindCSS (v3.4) usando clases utilitarias para lograr un diseño oscuro y "Glassmorphism" (ej. `.glass-panel`, `.text-shadow-neon`).
- **Iconos:** `lucide-react` (v1.22).
- **Backend / Base de Datos:** Supabase (PostgreSQL).

### Configuración del Despliegue
- El proyecto se hospeda en **Netlify**.
- **Comando de Build:** `tsc -b && vite build`.
- **Regla crítica:** Cualquier variable declarada y no utilizada (`TS6133`), errores de sintaxis JSX no cerrados, o falta de tipado generarán que el build en Netlify falle. Siempre verifica con `npm run build` localmente o usando un validador antes de realizar commits.

---

## 🧩 Estructura de Módulos (Frontend)

Todos los módulos principales viven en `src/modules/` y se renderizan dinámicamente desde `App.tsx`.

1. **`Caja.tsx` (POS y Facturación)**
   * **Layout de Pantalla Completa:** La cuadrícula de productos ocupa todo el ancho disponible (4-5 columnas según tamaño de pantalla) para maximizar la visibilidad del inventario.
   * **Slide-over Panel de Facturación:** El carrito y checkout se manejan en un panel lateral derecho deslizable que se abre mediante un botón flotante ("Ver Factura") que muestra la cantidad de items y total actual. Esto previene errores humanos al aislar visualmente el checkout.
   * **Descuento Global Dual:** Permite ingresar un descuento ya sea en porcentaje (`%`) o en valor monetario fijo en Córdobas (`C$`), sincronizando ambos campos en tiempo real de forma automática.
   * Soporta modalidades de pago: Efectivo (calculando y mostrando el cambio automáticamente), Crédito y Transferencia.
   * Maneja la emisión de recibos optimizados para **impresoras térmicas de 80mm**.

2. **`Inventario.tsx`**
   - CRUD del catálogo de productos.
   - Controla alertas visuales de inventario (Stock mínimo).

3. **`Clientes.tsx`**
   - Administración del directorio.
   - Control de métricas crediticias: `credit_limit` y `current_debt`.
   - Estado de expansión de créditos indexado de forma segura en reactividad (sin llamadas a hooks dentro de loops).

4. **`Rutas.tsx`**
   - Gestión de zonas geográficas o vendedores.
   - Un vendedor de ruta (`bv_collaborators`) tiene un ID que se asocia a las ventas que realiza en su jornada.

5. **`Reportes.tsx`**
   - Dashboard analítico con resumen P&L (Pérdidas y Ganancias).
   - Discrimina entre Ventas Locales y Ventas de Ruta.
   - Contabiliza los "Gastos Operativos" (provenientes de Caja) para deducirlos del ingreso neto.

6. **`Ajustes.tsx`**
   - Gestión de datos generales de facturación del negocio (nombre, dirección, teléfono, sitio web).
   - Administración de colaboradores, salarios base, activación/suspensión de accesos y reseteo de contraseñas.
   - **Tab de Seguridad:** Permite al usuario actual cambiar su propia contraseña. Cuenta con verificación de contraseña actual, visualizador de fortaleza (4 niveles visuales) y comparador visual en tiempo real de coincidencia.

---

## 🏗 Reglas de Negocio y Base de Datos (Supabase)

### 1. Ventas: Tienda vs Ruta
La tabla `bv_sales` contiene una columna clave `sale_type` (`store` o `route`).
- Las ventas de `store` se asocian a un **Turno de Caja** (`bv_cash_sessions`).
- Las ventas de `route` se asocian a un **Cierre de Jornada de Ruta** (`bv_route_closings`).

### 2. Comisiones Dinámicas (Rutas)
Los vendedores ganan un porcentaje dependiendo de la *categoría* del producto vendido (ej. Alimento de gatos = 3%, Accesorios = 5%).
- Esto se define en la tabla `bv_category_commissions`.
- **Cierre Atómico:** Cuando un vendedor termina su ruta, se llama al procedimiento almacenado (RPC) `bv_close_route(p_route_closing_id)`. Este RPC calcula del lado del servidor el total vendido por categoría y asigna las comisiones de manera 100% segura.

### 3. Manejo de Stock (Condiciones de Carrera)
**Regla crítica:** ¡NUNCA restar inventario desde el Frontend (React)!
- **Solución:** Se diseñó el procedimiento almacenado `bv_decrement_stock(p_product_id, p_quantity)` en Supabase. Cada venta iterada en el frontend manda a llamar este RPC para restar el stock atómicamente a nivel de la base de datos PostgreSQL.

### 4. Control de Límite de Crédito
- Si una venta al crédito excede el límite asignado al cliente (`credit_limit`), el sistema interrumpe la transacción y despliega un modal requiriendo la contraseña de autorización del usuario con rol **Owner** (Propietario).

### 5. Estado de Limpieza para Entrega (Producción)
- **Datos transaccionales:** Todas las tablas transaccionales (`bv_sales`, `bv_sale_items`, `bv_credits`, `bv_credit_payments`, `bv_cash_sessions`, `bv_purchases`, `bv_purchase_items`, `bv_expenses`, `bv_audit_log`) fueron purgadas de pruebas para dejar el sistema limpio.
- **Usuarios de prueba:** Se eliminaron las cuentas secundarias y de desarrollo de `auth.users` y `bv_collaborators`, quedando únicamente **Jose Alejandro Perez Miranda** (`jperezm300698@gmail.com`) como único usuario activo con rol `owner`.

---

## 🔮 Futuro Desarrollo (Backlog)

Para las siguientes conversaciones o sprints, estos son los problemas pendientes a resolver:

1. **Gestión de Devoluciones / Notas de Crédito**
   - Revertir una venta requiere: sumar inventario devuelto, descontar dinero del flujo de caja, y si fue en ruta, *restar* la comisión generada al vendedor.
2. **Abonos y Cuentas por Cobrar**
   - Actualmente un cliente acumula `current_debt`. Se necesita un módulo/modal para registrar "Abonos", donde un cliente paga parte de su deuda.
3. **Paginación / Virtualización**
   - Si la tabla `bv_sales` supera los miles de registros, la carga frontal del Reporte o la Caja podría saturarse. Implementar paginación con `range()` en Supabase.
4. **Activación de Row Level Security (RLS)**
   - Habilitar RLS en las 20 tablas de Supabase y configurar políticas de acceso restrictivas (ej. permitir lecturas/escrituras solo a usuarios autenticados) para evitar vulnerabilidades mediante la API key anónima.

---
*Documento actualizado tras la entrega y puesta a punto de producción (Julio 2026).*
