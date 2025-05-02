import React, { useState, useEffect } from 'react';
import { 
  Button, 
  Grid, 
  Card, 
  CardContent, 
  Typography,
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Container,
  useMediaQuery,
  useTheme,
  CircularProgress,
  Avatar,
  Divider
} from '@mui/material';
import { 
  Build as BuildIcon, 
  DirectionsCar as CarIcon, 
  Inventory as InventoryIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Logout as LogoutIcon,
  Refresh as RefreshIcon,
  People as PeopleIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { getAuth, signOut } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import firebaseApp from '../firebase/credenciales';
import './Home.css';
import NavigationHelper from '../NavigationManager';

const auth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);

/**
 * Home component for the MantencionPRO dashboard
 * Shows key metrics and quick actions based on user role
 */
const Home = ({ userRole, userData, onLogout, onNavigateToTab }) => {
  // Dashboard metrics state
  const [stats, setStats] = useState({
    equiposOperativos: 0,
    mantencionesPendientes: 0,
    inventarioBajo: 0,
    equiposDisponibles: 0
  });
  const [recentActivities, setRecentActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mecanicosAcciones, setMecanicosAcciones] = useState([]);
  
  // Responsive design hooks
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Load dashboard data on component mount
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Function to fetch and load dashboard data
  const loadDashboardData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get equipment data
      const equiposRef = collection(firestore, 'equipos');
      const equiposSnapshot = await getDocs(equiposRef);
      
      // Count equipment with "Operativo" status
      const equiposOperativos = equiposSnapshot.docs.filter(doc => 
        doc.data().estado === 'Operativo'
      ).length;
      
      // Count equipment with "disponible" availability status
      const equiposDisponibles = equiposSnapshot.docs.filter(doc => 
        doc.data().estadoDisponibilidad === 'disponible'
      ).length;

      // Only load additional data for admin and mechanic roles
      let mantencionesPendientes = 0;
      let inventarioBajo = 0;
      
      if (userRole === 'admin' || userRole === 'mecanico') {
        // Get pending maintenance count
        try {
          // Contar mantenciones pendientes de la colección mantenimientos
          const mantencionesRef = collection(firestore, 'mantenimientos');
          
          // Consulta base para mantenciones
          let mantencionesQuery;
          
          if (userRole === 'mecanico') {
            // Si es mecánico, solo ver sus propias mantenciones
            mantencionesQuery = query(
              mantencionesRef, 
              where('estado', 'in', ['pendiente', 'en_proceso']),
              where('responsable', '==', userData.id || userData.uid)
            );
          } else {
            // Si es admin, ver todas
            mantencionesQuery = query(
              mantencionesRef, 
              where('estado', 'in', ['pendiente', 'en_proceso'])
            );
          }
          
          const mantencionesSnapshot = await getDocs(mantencionesQuery);
          mantencionesPendientes = mantencionesSnapshot.size;
          
          // NUEVO: Contar también las fallas con estado pendiente
          const fallasRef = collection(firestore, 'fallas');
          
          // Consulta base para fallas
          let fallasQuery;
          
          if (userRole === 'mecanico') {
            // Si es mecánico, solo ver fallas asignadas a él
            fallasQuery = query(
              fallasRef,
              where('estado', '==', 'pendiente'),
              where('responsable', '==', userData.id || userData.uid)
            );
          } else {
            // Si es admin, ver todas
            fallasQuery = query(
              fallasRef,
              where('estado', '==', 'pendiente')
            );
          }
          
          const fallasSnapshot = await getDocs(fallasQuery);
          
          // También contar fallas que tengan estado pendiente en su último historial
          const fallasConHistorialPendiente = [];
          
          // Consulta para todas las fallas (con filtro por responsable si es mecánico)
          let todasLasFallasQuery;
          
          if (userRole === 'mecanico') {
            todasLasFallasQuery = query(
              fallasRef,
              where('responsable', '==', userData.id || userData.uid)
            );
          } else {
            todasLasFallasQuery = query(fallasRef);
          }
          
          const todasLasFallasSnapshot = await getDocs(todasLasFallasQuery);
          
          todasLasFallasSnapshot.docs.forEach(doc => {
            const falla = doc.data();
            if (falla.historial && falla.historial.length > 0) {
              const ultimoEstado = falla.historial[falla.historial.length - 1];
              if (ultimoEstado.estado === 'pendiente') {
                fallasConHistorialPendiente.push(doc.id);
              }
            }
          });
          
          // Sumamos las fallas con estado pendiente más las que tienen el último historial como pendiente
          // (evitando contar duplicados)
          const fallasIds = new Set([
            ...fallasSnapshot.docs.map(doc => doc.id),
            ...fallasConHistorialPendiente
          ]);
          
          mantencionesPendientes += fallasIds.size;
          
          // Get recent activities - filtrar por responsable si es mecánico
          let recentMaintenanceQuery;
          
          if (userRole === 'mecanico') {
            recentMaintenanceQuery = query(
              mantencionesRef,
              where('responsable', '==', userData.id || userData.uid),
              orderBy('fechaActualizacion', 'desc'),
              limit(3)
            );
          } else {
            recentMaintenanceQuery = query(
              mantencionesRef,
              orderBy('fechaActualizacion', 'desc'),
              limit(5)
            );
          }
          
          const recentMaintenanceSnap = await getDocs(recentMaintenanceQuery);
          
          // Si es admin, necesitamos obtener los nombres de los responsables
          let responsablesData = {};
          
          if (userRole === 'admin') {
            // Obtener una lista de todos los IDs de responsables en las mantenciones recientes
            const responsableIds = new Set();
            recentMaintenanceSnap.docs.forEach(doc => {
              const mant = doc.data();
              if (mant.responsable) {
                responsableIds.add(mant.responsable);
              }
            });
            
            // Obtener información de los usuarios correspondientes
            if (responsableIds.size > 0) {
              const usuariosRef = collection(firestore, 'usuarios');
              for (const responsableId of responsableIds) {
                try {
                  const usuarioDoc = await getDocs(query(usuariosRef, where('__name__', '==', responsableId)));
                  if (!usuarioDoc.empty) {
                    const userData = usuarioDoc.docs[0].data();
                    responsablesData[responsableId] = {
                      nombre: userData.nombre || 'Usuario',
                      correo: userData.correo || 'sin correo'
                    };
                  }
                } catch (error) {
                  console.error("Error al obtener datos de usuario:", error);
                }
              }
            }
          }
          
          const maintenanceActivities = recentMaintenanceSnap.docs.map(doc => {
            const mant = doc.data();
            return {
              id: doc.id,
              type: 'maintenance',
              title: `Mantenimiento ${mant.tipo === 'preventivo' ? 'Preventivo' : 'Correctivo'}`,
              description: `${mant.equipo} - ${mant.descripcion?.substring(0, 60)}${mant.descripcion?.length > 60 ? '...' : ''}`,
              date: mant.fechaActualizacion?.toDate() || new Date(),
              estado: mant.estado,
              responsable: mant.responsable || 'No asignado',
              responsableNombre: (userRole === 'admin' && mant.responsable && responsablesData[mant.responsable]) 
                                 ? responsablesData[mant.responsable].nombre : null,
              // Priorizar el campo mecanico, si existe, sobre el responsable
              responsableCorreo: (userRole === 'admin') 
                                 ? (mant.mecanico || 
                                   ((mant.responsable && responsablesData[mant.responsable]) 
                                     ? responsablesData[mant.responsable].correo 
                                     : 'No asignado'))
                                 : null
            };
          });
          
          setRecentActivities(maintenanceActivities);
          
          // Si es admin, cargar todas las mantenciones y fallas de todos los mecánicos
          if (userRole === 'admin') {
            try {
              // Obtener usuarios mecánicos
              const usuariosRef = collection(firestore, 'usuarios');
              const mecanicosQuery = query(
                usuariosRef,
                where('rol', '==', 'mecanico')
              );
              const mecanicosSnapshot = await getDocs(mecanicosQuery);
              
              // Crear un mapa de IDs de mecánicos a sus nombres para referenciar después
              const mecanicoNamesMap = {};
              mecanicosSnapshot.docs.forEach(doc => {
                const data = doc.data();
                mecanicoNamesMap[doc.id] = data.nombre || data.correo || 'Mecánico';
              });
              
              // Obtener todas las mantenciones recientes sin filtrar por mecánico específico
              const allMaintenanceQuery = query(
                mantencionesRef,
                orderBy('fechaActualizacion', 'desc'),
                limit(15) // Obtener un número mayor para tener suficientes para mostrar
              );
              
              const allMaintenanceSnap = await getDocs(allMaintenanceQuery);
              
              // Mapa para agrupar actividades por mecánico
              const mecanicosActividadesMap = {};
              
              // Procesar cada mantenimiento y asignarlo al mecánico responsable
              allMaintenanceSnap.docs.forEach(doc => {
                const mant = doc.data();
                const responsableId = mant.responsable;
                
                // Solo incluir si tiene un responsable asignado
                if (responsableId && mecanicoNamesMap[responsableId]) {
                  if (!mecanicosActividadesMap[responsableId]) {
                    mecanicosActividadesMap[responsableId] = {
                      id: responsableId,
                      nombre: mecanicoNamesMap[responsableId],
                      acciones: []
                    };
                  }
                  
                  mecanicosActividadesMap[responsableId].acciones.push({
                    id: doc.id,
                    type: 'maintenance',
                    title: `Mantenimiento ${mant.tipo === 'preventivo' ? 'Preventivo' : 'Correctivo'}`,
                    description: `${mant.equipo} - ${mant.descripcion?.substring(0, 40)}${mant.descripcion?.length > 40 ? '...' : ''}`,
                    date: mant.fechaActualizacion?.toDate() || new Date(),
                    estado: mant.estado
                  });
                }
              });
              
              // Obtener todas las fallas recientes
              const allFailuresQuery = query(
                fallasRef,
                orderBy('fecha', 'desc'),
                limit(15)
              );
              
              const allFailuresSnap = await getDocs(allFailuresQuery);
              
              // Procesar cada falla y asignarla al mecánico responsable
              allFailuresSnap.docs.forEach(doc => {
                const falla = doc.data();
                const responsableId = falla.responsable;
                
                // Solo incluir si tiene un responsable asignado
                if (responsableId && mecanicoNamesMap[responsableId]) {
                  if (!mecanicosActividadesMap[responsableId]) {
                    mecanicosActividadesMap[responsableId] = {
                      id: responsableId,
                      nombre: mecanicoNamesMap[responsableId],
                      acciones: []
                    };
                  }
                  
                  mecanicosActividadesMap[responsableId].acciones.push({
                    id: doc.id,
                    type: 'failure',
                    title: `Falla Reportada`,
                    description: `${falla.equipo} - ${falla.descripcion?.substring(0, 40)}${falla.descripcion?.length > 40 ? '...' : ''}`,
                    date: falla.fecha?.toDate() || new Date(),
                    estado: falla.estado
                  });
                }
              });
              
              // Convertir el mapa a un array y ordenar las actividades por fecha
              const accionesMecanicos = Object.values(mecanicosActividadesMap).map(mecanico => {
                // Ordenar las acciones por fecha (más reciente primero)
                mecanico.acciones.sort((a, b) => b.date - a.date);
                
                // Limitar a 3 acciones por mecánico para la visualización
                mecanico.acciones = mecanico.acciones.slice(0, 3);
                
                return mecanico;
              });
              
              // Filtrar solo mecánicos que tengan acciones
              const mecanicosConAcciones = accionesMecanicos.filter(mecanico => 
                mecanico.acciones && mecanico.acciones.length > 0
              );
              
              // Actualizar el estado con las actividades de los mecánicos
              setMecanicosAcciones(mecanicosConAcciones);
              
            } catch (error) {
              console.error("Error al cargar actividades de mecánicos:", error);
            }
          }
          
        } catch (error) {
          console.error("Error al cargar mantenciones:", error);
          mantencionesPendientes = 0;
        }

        // Get low inventory items
        try {
          // Check both 'inventario' and 'repuestos' collections
          const inventarioRef = collection(firestore, 'inventario');
          const inventarioSnapshot = await getDocs(inventarioRef);
          const itemsBajosInventario = inventarioSnapshot.docs.filter(doc => {
            const item = doc.data();
            return item.cantidad <= item.minimo;
          }).length;
          
          // MODIFICADO: Compara el stock con el minimo para cada repuesto
          const repuestosRef = collection(firestore, 'repuestos');
          const repuestosSnapshot = await getDocs(repuestosRef);
          const repuestosBajosStock = repuestosSnapshot.docs.filter(doc => {
            const repuesto = doc.data();
            // Compara el stock con el minimo específico de cada repuesto
            return repuesto.stock !== undefined && 
                   repuesto.minimo !== undefined && 
                   repuesto.stock < repuesto.minimo;
          }).length;
          
          inventarioBajo = itemsBajosInventario + repuestosBajosStock;
        } catch (error) {
          console.error("Error al cargar inventario:", error);
          inventarioBajo = 0;
        }
      }

      // Update state with fetched data
      setStats({
        equiposOperativos,
        mantencionesPendientes,
        inventarioBajo,
        equiposDisponibles
      });

    } catch (error) {
      console.error("Error al cargar datos del dashboard:", error);
      setError("Error al cargar datos. Intente nuevamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // Stat Card component for displaying metrics
  const StatCard = ({ title, value, icon, color }) => (
    <Card className="stat-card" elevation={2}>
      <CardContent>
        <Box display="flex" flexDirection={isMobile ? 'column' : 'row'} 
             justifyContent="space-between" alignItems="center" className="stat-card-content"
             sx={{ height: isMobile ? '100%' : 'auto' }}>
          <Box textAlign={isMobile ? 'center' : 'left'} mb={isMobile ? 2 : 0}>
            <Typography variant={isMobile ? 'body1' : 'h6'} color="textSecondary" className="stat-title">
              {title}
            </Typography>
            <Typography variant={isMobile ? 'h5' : 'h4'} className="stat-value" style={{ color: color || '#1890FF' }}>
              {value}
            </Typography>
          </Box>
          <Box sx={{ color: color || '#1890FF' }} className="stat-icon">
            {React.cloneElement(icon, { style: { fontSize: isMobile ? 30 : 40 } })}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  // Activity Item component for recent activities
  const ActivityItem = ({ activity }) => (
    <Box 
      sx={{
        p: 2, 
        mb: 1,
        borderRadius: 1,
        bgcolor: 'background.paper',
        border: '1px solid #eee'
      }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1" fontWeight="bold">
          {activity.title}
        </Typography>
        <Typography variant="caption" color="textSecondary">
          {activity.date instanceof Date 
            ? activity.date.toLocaleDateString() 
            : 'Fecha no disponible'}
        </Typography>
      </Box>
      
      {/* Descripción con correo del responsable */}
      <Box mt={1}>
        <Typography variant="body2">
          {activity.description}
        </Typography>
        
        {userRole === 'admin' && (
          <Box sx={{ 
            mt: 1, 
            display: 'flex', 
            alignItems: 'center',
            bgcolor: '#f0f5ff',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            width: 'fit-content'
          }}>
            <PersonIcon fontSize="small" sx={{ mr: 0.5, fontSize: '0.9rem', color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {activity.responsableCorreo || 'No asignado'}
            </Typography>
          </Box>
        )}
      </Box>
      
      <Box mt={1} display="flex" justifyContent="flex-end">
        <Typography 
          variant="caption" 
          sx={{
            px: 1,
            py: 0.5,
            borderRadius: 1,
            bgcolor: activity.estado === 'pendiente' 
              ? '#FFF7E6' 
              : activity.estado === 'en_proceso'
                ? '#E6F7FF'
                : '#F6FFED',
            color: activity.estado === 'pendiente' 
              ? '#FA8C16' 
              : activity.estado === 'en_proceso'
                ? '#1890FF'
                : '#52C41A',
          }}
        >
          {activity.estado === 'pendiente' 
            ? 'Pendiente' 
            : activity.estado === 'en_proceso' 
              ? 'En Proceso' 
              : 'Completado'}
        </Typography>
      </Box>
    </Box>
  );

  // Mechanic Activity Item component - versión más compacta para la vista del admin
  const MechanicActivityItem = ({ activity }) => (
    <Box 
      sx={{
        p: 1.5, 
        mb: 1,
        borderRadius: 1,
        bgcolor: 'background.paper',
        border: '1px solid #eee'
      }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" fontWeight="medium">
          {activity.title}
        </Typography>
        <Typography variant="caption" color="textSecondary" fontSize="0.7rem">
          {activity.date instanceof Date 
            ? activity.date.toLocaleDateString() 
            : 'Fecha no disponible'}
        </Typography>
      </Box>
      <Typography variant="caption" mt={0.5} display="block">
        {activity.description}
        <Box component="span" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic', fontSize: '0.7rem', color: 'text.secondary' }}>
          {activity.responsableCorreo || ''}
        </Box>
      </Typography>
      <Box mt={0.5} display="flex" justifyContent="flex-end">
        <Typography 
          variant="caption" 
          sx={{
            px: 1,
            py: 0.25,
            borderRadius: 1,
            fontSize: '0.65rem',
            bgcolor: activity.estado === 'pendiente' 
              ? '#FFF7E6' 
              : activity.estado === 'en_proceso'
                ? '#E6F7FF'
                : '#F6FFED',
            color: activity.estado === 'pendiente' 
              ? '#FA8C16' 
              : activity.estado === 'en_proceso'
                ? '#1890FF'
                : '#52C41A',
          }}
        >
          {activity.estado === 'pendiente' 
            ? 'Pendiente' 
            : activity.estado === 'en_proceso' 
              ? 'En Proceso' 
              : 'Completado'}
        </Typography>
      </Box>
    </Box>
  );

  // Navigate to Trabajadores screen
  const handleNavigateToTrabajadores = () => {
    NavigationHelper.navigate('trabajadores');
  };

  // View for driver role
  const renderDriverView = () => {
    // Find the index of "Reportar Falla" tab for drivers
    const reporteFallaTabIndex = 2; // Default for drivers based on MantencionPRO.js
    
    return (
      <Box>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <StatCard
              title="Equipos Disponibles"
              value={stats.equiposDisponibles}
              icon={<CheckCircleIcon />}
              color="#52C41A"
            />
          </Grid>
        </Grid>
        
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Acciones Rápidas
          </Typography>
          <Button
            variant="contained"
            color="warning"
            fullWidth
            startIcon={<WarningIcon />}
            className="action-button"
            onClick={() => onNavigateToTab(reporteFallaTabIndex)}
            sx={{ py: 1.5, borderRadius: 2 }}
          >
            Reportar Falla
          </Button>
        </Box>
      </Box>
    );
  };

  // View for admin and mechanic roles
  const renderAdminMechanicView = () => {
    // Tab indices for admin/mechanic
    const mantencionTabIndex = 3; // Index for "Mantención" based on MantencionPRO.js
    const inventarioTabIndex = 1; // Index for "Inventario" based on MantencionPRO.js
    
    return (
      <>
        <Grid container spacing={isMobile ? 2 : 3} className="equal-height-cards">
          <Grid item xs={12} sm={6} md={4}>
            <StatCard
              title="Equipos Operativos"
              value={stats.equiposOperativos}
              icon={<CarIcon />}
              color="#4CAF50"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <StatCard
              title="Mantenciones Pendientes"
              value={stats.mantencionesPendientes}
              icon={<BuildIcon />}
              color="#FF9800"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <StatCard
              title="Inventario Bajo"
              value={stats.inventarioBajo}
              icon={<InventoryIcon />}
              color="#F44336"
            />
          </Grid>
        </Grid>

        <Box className="actions-container" mt={4} mb={4}>
          <Typography variant={isMobile ? 'h6' : 'h5'} gutterBottom>
            Acciones Rápidas
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                startIcon={<BuildIcon />}
                className="action-button"
                onClick={() => onNavigateToTab(mantencionTabIndex)}
                sx={{ py: 1.5, borderRadius: 2 }}
              >
                Nueva Mantención
              </Button>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Button
                variant="contained"
                color="secondary"
                fullWidth
                startIcon={<InventoryIcon />}
                className="action-button"
                onClick={() => onNavigateToTab(inventarioTabIndex)}
                sx={{ py: 1.5, borderRadius: 2 }}
              >
                Gestionar Inventario
              </Button>
            </Grid>
            
            {/* Admin-only button for Workers Management */}
            {userRole === 'admin' && (
              <Grid item xs={12} mt={2}>
                <Button
                  variant="contained"
                  color="info"
                  fullWidth
                  startIcon={<PeopleIcon />}
                  className="action-button"
                  onClick={handleNavigateToTrabajadores}
                  sx={{ py: 1.5, borderRadius: 2 }}
                >
                  Ver Trabajadores
                </Button>
              </Grid>
            )}
          </Grid>
        </Box>
        
        {/* Recent Activities Section */}
        {recentActivities.length > 0 && (
          <Box mt={4}>
            <Typography variant={isMobile ? 'h6' : 'h5'} gutterBottom>
              Actividades Recientes
            </Typography>
            {recentActivities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </Box>
        )}
        
        {/* Actividades Recientes de Mecánicos - Sólo para admin */}
        {userRole === 'admin' && mecanicosAcciones.length > 0 && (
          <Box mt={5}>
            <Typography variant={isMobile ? 'h6' : 'h5'} gutterBottom>
              Actividades Recientes - Equipo de Mecánicos
            </Typography>
            <Grid container spacing={2}>
              {mecanicosAcciones.map((mecanico) => (
                <Grid item xs={12} md={6} key={mecanico.id}>
                  <Card elevation={1} sx={{ mb: 2 }}>
                    <CardContent sx={{ pt: 2, pb: 2 }}>
                      <Box display="flex" alignItems="center" mb={1}>
                        <Avatar sx={{ bgcolor: '#1890FF', width: 32, height: 32, mr: 1 }}>
                          <PersonIcon fontSize="small" />
                        </Avatar>
                        <Typography variant="subtitle1">
                          {mecanico.nombre}
                        </Typography>
                      </Box>
                      <Divider sx={{ my: 1 }} />
                      {mecanico.acciones.map((action) => (
                        <MechanicActivityItem key={action.id} activity={action} />
                      ))}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}
      </>
    );
  };

  // Handle sign out
  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('userData');
      if (onLogout && typeof onLogout === 'function') {
        onLogout();
      }
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      alert("Error al cerrar sesión");
    }
  };

  return (
    <Box className="home-container">
      {/* App Bar / Header */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant={isMobile ? 'h6' : 'h5'} className="app-title">
              Panel Principal
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {userData?.nombre || userData?.correo} - {
                userRole === 'admin' ? 'Administrador' : 
                userRole === 'mecanico' ? 'Mecánico' : 
                userRole === 'conductor' ? 'Conductor' : 'Usuario'
              }
            </Typography>
          </Box>
          <IconButton 
            color="primary" 
            onClick={loadDashboardData} 
            disabled={isLoading}
            sx={{ mr: 1 }}
          >
            <RefreshIcon />
          </IconButton>
          <IconButton color="error" onClick={handleLogout}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Container maxWidth="lg" className="main-content" sx={{ py: 3 }}>
        {/* Error Message */}
        {error && (
          <Box 
            sx={{ 
              p: 2, 
              mb: 3, 
              borderRadius: 1, 
              bgcolor: '#FFF1F0', 
              border: '1px solid #FFA39E' 
            }}
          >
            <Typography color="error">{error}</Typography>
            <Button 
              startIcon={<RefreshIcon />}
              onClick={loadDashboardData}
              variant="outlined"
              color="error"
              size="small"
              sx={{ mt: 1 }}
            >
              Reintentar
            </Button>
          </Box>
        )}
        
        {/* Loading State */}
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
            <CircularProgress />
          </Box>
        ) : (
          userRole === 'conductor' ? renderDriverView() : renderAdminMechanicView()
        )}
      </Container>
    </Box>
  );
};

export default Home;