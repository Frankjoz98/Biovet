# 🏥 BioVet OS - Sistema de Punto de Venta y Gestión

BioVet OS es un moderno y ultra-rápido sistema de Punto de Venta (POS) y gestión empresarial, diseñado para operar negocios con formato de veterinaria, farmacia, clínica o supermercado. Construido sobre una arquitectura "Single Page Application" (SPA), garantiza transacciones en tiempo real con latencia casi nula.

## 🚀 Características Principales

### 🛒 Módulo de Caja (Punto de Venta)
- Interfaz a pantalla completa optimizada para rapidez y máxima visibilidad.
- Buscador predictivo de productos integrado directamente en el panel de facturación.
- Múltiples métodos de pago soportados: **Efectivo, Transferencia y Crédito**.
- Control estricto de sesiones de caja (Turnos): Apertura, Pre-cierre informativo y Cierre con arqueo de caja (Cálculo exacto de faltantes y sobrantes).
- Descuentos individuales por producto o globales (porcentaje o monto fijo monetario).

### 📦 Gestión de Inventario
- Control de stock y precios en tiempo real.
- Manejo de costos de adquisición y márgenes de ganancia.
- Asignación de comisiones por producto/categoría.
- Alertas visuales para productos con stock bajo.

### 👥 Gestión de Clientes y Créditos
- Sistema de registro con historial de compras.
- Control de Deuda Actual y **Límites de Crédito** para proteger la liquidez del negocio.
- Sistema de autorización requerida (Pin de Dueño/Administrador) para aprobar ventas que exceden el límite de crédito de un cliente.

### 📊 Reportes y Analíticas
- Paneles visuales de ingresos y egresos (Bitácora de Gastos).
- Desglose financiero por turnos, métodos de pago y ganancias netas.
- Auditoría del flujo de efectivo e historial de transacciones.

### 🚚 Sistema de Rutas
- Asignación de colaboradores a rutas de venta externas.
- Cierres de ruta individuales con cálculo automático de comisiones generadas por los colaboradores según categorías de productos.

### 🔐 Seguridad y Control de Acceso (Roles)
- **Dueño (Owner):** Acceso irrestricto a reportes financieros, bitácora de gastos, configuraciones globales y permisos especiales.
- **Administrador (Admin):** Acceso a inventario, reportes operativos y caja. Capacidad de autorizar créditos en ausencia del dueño.
- **Colaborador:** Acceso restringido exclusivamente al Punto de Venta (Caja) y Rutas. Bloqueado por completo de visualizar métricas financieras o inventarios (según configuración).

## 🛠️ Stack Tecnológico

- **Core:** React 19 + TypeScript
- **Empaquetado:** Vite
- **Diseño y UI:** Tailwind CSS (Diseño oscuro moderno, con neones y micro-interacciones)
- **Base de Datos & Auth:** Supabase (PostgreSQL, WebSockets)
- **Iconografía:** Lucide React

## 💻 Instalación y Desarrollo Local

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/Frankjoz98/Biovet.git
   ```
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Configurar variables de entorno en la raíz (`.env`):
   ```env
   VITE_SUPABASE_URL=tu_url_de_supabase
   VITE_SUPABASE_ANON_KEY=tu_anon_key_de_supabase
   ```
4. Iniciar el servidor local de desarrollo:
   ```bash
   npm run dev
   ```

## 📜 Estado Actual del Proyecto
**Versión 1.0 (Producción)**. El sistema es estable, se encuentra publicado en Netlify y cuenta con todas las funciones críticas de negocio listas para operar comercialmente. Mantenimiento y evoluciones a Versión 2.0 en espera de feedback real del cliente.
