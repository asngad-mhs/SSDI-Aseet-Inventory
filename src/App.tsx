/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  LayoutDashboard, 
  Package, 
  MapPin, 
  Wrench, 
  Plus, 
  Search, 
  Bell, 
  LogOut, 
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  ArrowUpDown,
  MoreVertical,
  Edit,
  Trash2,
  Calendar,
  X,
  ArrowLeft
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { format, addDays, isBefore, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

import { db, auth, handleFirestoreError } from './lib/firebase';
import { cn, formatCurrency } from './lib/utils';
import { Asset, Location, MaintenanceLog, OperationType, AssetCategory, AssetStatus, AssetCondition } from './types';
import { Button, Card, Input, Badge } from './components/UI';

// --- Components ---

function Header({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-bottom border-slate-200 bg-white/80 px-6 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">SS</div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">SSDI Inventory</h1>
          <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Asset Management</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="relative rounded-full p-2 hover:bg-slate-100">
          <Bell className="h-5 w-5 text-slate-600" />
          <span className="absolute top-2 right-2 flex h-2 w-2 rounded-full bg-red-500"></span>
        </button>
        <div className="flex items-center gap-3 border-left border-slate-200 pl-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{user.displayName}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
          <img src={user.photoURL || ''} alt="" className="h-9 w-9 rounded-full border border-slate-200" />
          <button onClick={onSignOut} className="rounded-full p-2 hover:bg-red-50 hover:text-red-500 transition-colors">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (tab: string) => void }) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'assets', label: 'Inventory', icon: Package },
    { id: 'locations', label: 'Locations', icon: MapPin },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  ];

  return (
    <aside className="fixed left-0 top-16 hidden h-[calc(100vh-64px)] w-64 flex-col border-right border-slate-200 bg-white p-4 lg:flex">
      <nav className="flex-1 space-y-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
              activeTab === tab.id 
                ? "bg-blue-50 text-blue-600" 
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <tab.icon className={cn("h-5 w-5", activeTab === tab.id ? "text-blue-600" : "text-slate-400")} />
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto rounded-xl bg-slate-900 p-4 text-white">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">System Status</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
          <p className="text-sm">Real-time Sync Active</p>
        </div>
      </div>
    </aside>
  );
}

// --- App Logic ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [assets, setAssets] = useState<Asset[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editingLog, setEditingLog] = useState<MaintenanceLog | null>(null);
  const [viewingAsset, setViewingAsset] = useState<Asset | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Connection validation as per instructions
  useEffect(() => {
    if (!user) return;
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, [user]);

  // Real-time Data Listeners
  useEffect(() => {
    if (!user) return;

    const assetsQuery = query(
      collection(db, 'assets'), 
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeAssets = onSnapshot(assetsQuery, (snapshot) => {
      setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'assets'));

    const locationsQuery = query(collection(db, 'locations'));
    const unsubscribeLocations = onSnapshot(locationsQuery, (snapshot) => {
      setLocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'locations'));

    const logsQuery = query(
      collection(db, 'maintenance_logs'), 
      where('ownerId', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
      setMaintenanceLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceLog)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'maintenance_logs'));

    return () => {
      unsubscribeAssets();
      unsubscribeLocations();
      unsubscribeLogs();
    };
  }, [user]);

  const stats = useMemo(() => {
    const totalAssets = assets.length;
    const totalValue = assets.reduce((sum, a) => sum + (a.cost || 0), 0);
    const maintenanceRequired = assets.filter(a => {
      if (!a.nextMaintenanceDate) return false;
      return isBefore(parseISO(a.nextMaintenanceDate), addDays(new Date(), 7));
    }).length;
    
    // Category Breakdown
    const categories = assets.reduce((acc, a) => {
      acc[a.category] = (acc[a.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const chartData = Object.entries(categories).map(([name, value]) => ({ name, value }));

    // Maintenance Timeline (last 6 months)
    const monthlyMaintenance = Array.from({ length: 6 }, (_, i) => {
      const date = addDays(new Date(), -i * 30);
      const label = format(date, 'MMM');
      const count = maintenanceLogs.filter(log => {
        const logDate = parseISO(log.date);
        return logDate.getMonth() === date.getMonth();
      }).length;
      return { month: label, count };
    }).reverse();

    return { totalAssets, totalValue, maintenanceRequired, chartData, monthlyMaintenance };
  }, [assets, maintenanceLogs]);

  const filteredAssets = useMemo(() => {
    return assets.filter(a => 
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.serialNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [assets, searchQuery]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setActiveTab('dashboard');
  };

  const handleCreateAsset = async (data: Partial<Asset>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'assets'), {
        ...data,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShowAssetModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'assets');
    }
  };

  const handleUpdateAsset = async (id: string, data: Partial<Asset>) => {
    try {
      await updateDoc(doc(db, 'assets', id), {
        ...data,
        updatedAt: serverTimestamp(),
      });
      setShowAssetModal(false);
      setEditingAsset(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `assets/${id}`);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (!confirm('Are you sure you want to delete this asset?')) return;
    try {
      await deleteDoc(doc(db, 'assets', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `assets/${id}`);
    }
  };

  const handleCreateLocation = async (data: Partial<Location>) => {
    try {
      await addDoc(collection(db, 'locations'), data);
      setShowLocationModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'locations');
    }
  };

  const handleUpdateLocation = async (id: string, data: Partial<Location>) => {
    try {
      await updateDoc(doc(db, 'locations', id), data);
      setShowLocationModal(false);
      setEditingLocation(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `locations/${id}`);
    }
  };

  const handleDeleteLocation = async (id: string) => {
    const assetsInLocation = assets.filter(a => a.locationId === id);
    if (assetsInLocation.length > 0) {
      alert(`Cannot delete location. It still contains ${assetsInLocation.length} assets.`);
      return;
    }
    if (!confirm('Are you sure you want to delete this location?')) return;
    try {
      await deleteDoc(doc(db, 'locations', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `locations/${id}`);
    }
  };

  const handleCreateMaintenanceLog = async (logData: Partial<MaintenanceLog>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'maintenance_logs'), {
        ...logData,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
      
      if (logData.assetId) {
        await updateDoc(doc(db, 'assets', logData.assetId), {
          lastMaintenanceDate: logData.date,
          updatedAt: serverTimestamp(),
        });
      }
      setShowLogModal(false);
      setEditingLog(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'maintenance_logs');
    }
  };

  const handleUpdateMaintenanceLog = async (id: string, logData: Partial<MaintenanceLog>) => {
    try {
      await updateDoc(doc(db, 'maintenance_logs', id), {
        ...logData,
        updatedAt: serverTimestamp(),
      });
      setShowLogModal(false);
      setEditingLog(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `maintenance_logs/${id}`);
    }
  };

  const handleDeleteMaintenanceLog = async (id: string) => {
    if (!confirm('Are you sure you want to delete this log?')) return;
    try {
      await deleteDoc(doc(db, 'maintenance_logs', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `maintenance_logs/${id}`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-sm font-medium text-slate-500">Initializing System...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-900">
        <div className="absolute inset-0 z-0">
          <div className="atmosphere absolute inset-0 opacity-40"></div>
        </div>
        <Card className="z-10 w-full max-w-md border-slate-800 bg-slate-950/50 p-8 text-white backdrop-blur-xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-3xl font-bold shadow-2xl shadow-blue-500/20">SS</div>
            <h1 className="mt-6 text-3xl font-bold tracking-tight">SSDI Inventory</h1>
            <p className="mt-2 text-slate-400">Enterprise-grade asset management & maintenance tracking.</p>
            <Button 
              onClick={login}
              className="mt-8 w-full gap-3 h-12 text-lg"
              variant="primary"
            >
              Sign in with Google
              <ChevronRight className="h-5 w-5" />
            </Button>
            <p className="mt-6 text-xs text-slate-500">Restricted Access • SSDI Corporate Internal Tool</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header user={user} onSignOut={logout} />
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="lg:pl-64 min-h-screen pt-4 pb-20 px-6">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">System Intelligence</h2>
                  <p className="text-slate-500">Overview of organizational assets and health.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="info">Live Feed Active</Badge>
                  <span className="text-xs text-slate-400">Updated: {format(new Date(), 'HH:mm:ss')}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard 
                  title="Total Assets" 
                  value={stats.totalAssets} 
                  icon={Package} 
                  color="blue"
                  trend="+2.5% vs last month"
                />
                <StatCard 
                  title="Total Valuation" 
                  value={formatCurrency(stats.totalValue)} 
                  icon={TrendingUp} 
                  color="green" 
                  trend="Audit verified"
                />
                <StatCard 
                  title="Maintenance Due" 
                  value={stats.maintenanceRequired} 
                  icon={AlertTriangle} 
                  color="amber" 
                  trend="Next 7 days"
                />
                <StatCard 
                  title="System Status" 
                  value="Optimal" 
                  icon={CheckCircle2} 
                  color="emerald" 
                  trend="All clusters operational"
                />
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2 p-6">
                  <h3 className="text-lg font-semibold mb-4">Maintenance Activity</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.monthlyMaintenance}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} />
                        <Tooltip 
                          cursor={{ fill: '#f1f5f9' }}
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Asset Distribution</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.chartData}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {stats.chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'][index % 6]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 space-y-2">
                    {stats.chartData.map((item, i) => (
                      <div key={item.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'][i % 6] }}></div>
                          <span className="text-slate-600">{item.name}</span>
                        </div>
                        <span className="font-semibold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Critical Assets</h3>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('assets')}>View All</Button>
                  </div>
                  <div className="space-y-4">
                    {assets.filter(a => a.condition === 'Fair' || a.condition === 'Poor').slice(0, 5).map(asset => (
                      <div key={asset.id} className="flex items-center justify-between rounded-lg bg-orange-50 p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm">
                            <Package className="h-5 w-5 text-orange-500" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{asset.name}</p>
                            <p className="text-xs text-slate-500">{asset.category} • {asset.serialNumber || 'No S/N'}</p>
                          </div>
                        </div>
                        <Badge variant={asset.condition === 'Poor' ? 'error' : 'warning'}>{asset.condition}</Badge>
                      </div>
                    ))}
                    {assets.filter(a => a.condition === 'Fair' || a.condition === 'Poor').length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                        <CheckCircle2 className="h-8 w-8 mb-2" />
                        <p>No critical assets identified.</p>
                      </div>
                    )}
                  </div>
                </Card>
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Maintenance Feed</h3>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('maintenance')}>View Logs</Button>
                  </div>
                  <div className="space-y-4">
                    {maintenanceLogs.slice(0, 5).map(log => (
                      <div key={log.id} className="relative pl-6 pb-4 border-l border-slate-200 last:pb-0">
                        <div className="absolute left-[-5px] top-1 h-2 w-2 rounded-full bg-blue-500"></div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-slate-500">{format(parseISO(log.date), 'MMM dd, yyyy')}</p>
                          <Badge variant={log.status === 'Completed' ? 'success' : 'info'}>{log.status}</Badge>
                        </div>
                        <p className="text-sm font-semibold mt-1">
                          {assets.find(a => a.id === log.assetId)?.name || 'Unknown Asset'}
                        </p>
                        <p className="text-xs text-slate-600 line-clamp-1">{log.description}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </motion.div>
          )}

          {activeTab === 'assets' && (
            <motion.div 
              key="assets"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Asset Registry</h2>
                  <p className="text-slate-500">Manage organizational inventory and tracking.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-2">
                    <ArrowUpDown className="h-4 w-4" /> Export
                  </Button>
                  <Button onClick={() => { setEditingAsset(null); setShowAssetModal(true); }} className="gap-2">
                    <Plus className="h-5 w-5" /> Add Asset
                  </Button>
                </div>
              </div>

              <Card className="p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input 
                      placeholder="Search by name, serial, or category..." 
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Filter className="h-4 w-4" /> Filter
                    </Button>
                  </div>
                </div>

                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Asset</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Location</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAssets.map(asset => (
                        <tr key={asset.id} className="group hover:bg-slate-50/50">
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
                                {asset.category === 'IT' ? <LayoutDashboard className="h-5 w-5 text-blue-500" /> : <Package className="h-5 w-5 text-slate-400" />}
                              </div>
                              <div>
                                <p className="font-semibold">{asset.name}</p>
                                <p className="text-xs text-slate-500">{asset.serialNumber || 'SN: N/A'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm">{asset.category}</td>
                          <td className="px-4 py-4 text-sm">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              {locations.find(l => l.id === asset.locationId)?.name || 'Unassigned'}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge status={asset.status} />
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setViewingAsset(asset)}>
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-600" onClick={() => { setEditingAsset(asset); setShowAssetModal(true); }}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600" onClick={() => handleDeleteAsset(asset.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'locations' && (
            <motion.div 
              key="locations"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Facility Locations</h2>
                  <p className="text-slate-500">Asset distribution map and location management.</p>
                </div>
                <Button onClick={() => { setEditingLocation(null); setShowLocationModal(true); }} className="gap-2">
                  <Plus className="h-5 w-5" /> New Location
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {locations.map(loc => {
                  const assetsCount = assets.filter(a => a.locationId === loc.id).length;
                  return (
                    <Card key={loc.id} className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
                          <MapPin className="h-6 w-6 text-slate-600" />
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">{assetsCount}</p>
                          <p className="text-xs uppercase tracking-wider text-slate-500">Assets</p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <h3 className="font-bold">{loc.name}</h3>
                        <p className="mt-1 text-sm text-slate-500">{loc.description}</p>
                      </div>
                      <div className="mt-6 flex gap-2">
                        <Button variant="outline" className="flex-1 text-xs" onClick={() => { setSearchQuery(loc.name); setActiveTab('assets'); }}>View Assets</Button>
                        <Button variant="ghost" className="text-xs" onClick={() => { setEditingLocation(loc); setShowLocationModal(true); }}>Edit</Button>
                        <Button variant="ghost" className="text-xs text-red-600" onClick={() => handleDeleteLocation(loc.id)}>Delete</Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === 'maintenance' && (
            <motion.div 
               key="maintenance"
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -10 }}
               className="space-y-6"
            >
               <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Maintenance Central</h2>
                  <p className="text-slate-500">Lifecycle logs and service schedules.</p>
                </div>
                <Button onClick={() => { setEditingLog(null); setShowLogModal(true); }} className="gap-2">
                  <Plus className="h-5 w-5" /> Schedule Service
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold">Service Timeline</h3>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Search logs..." 
                        className="w-64" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-8">
                    {maintenanceLogs.filter(log => {
                      const asset = assets.find(a => a.id === log.assetId);
                      return asset?.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             log.description.toLowerCase().includes(searchQuery.toLowerCase());
                    }).map((log, idx, arr) => {
                      const asset = assets.find(a => a.id === log.assetId);
                      return (
                        <div key={log.id} className="flex gap-4 group">
                          <div className="flex flex-col items-center">
                            <div className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-full border-2 shrink-0",
                              log.status === 'Completed' ? "border-green-200 bg-green-50 text-green-600" : "border-blue-200 bg-blue-50 text-blue-600"
                            )}>
                              {log.status === 'Completed' ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                            </div>
                            {idx !== arr.length - 1 && <div className="mt-2 w-0.5 grow bg-slate-100" />}
                          </div>
                          <div className="flex-1 pb-8">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-400">{format(parseISO(log.date), 'MMMM dd, yyyy')}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant={log.type === 'Repair' ? 'error' : 'info'}>{log.type}</Badge>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditingLog(log); setShowLogModal(true); }}>
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600" onClick={() => handleDeleteMaintenanceLog(log.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                            <h4 className="mt-1 text-lg font-bold">{asset?.name || 'Unknown Asset'}</h4>
                            <p className="mt-2 text-slate-600">{log.description}</p>
                            <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium text-slate-500">
                              <div className="flex items-center gap-1">
                                <Wrench className="h-3 w-3" />
                                Performed by: {log.performedBy}
                              </div>
                              <div className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                Cost: {formatCurrency(log.cost || 0)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {maintenanceLogs.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <Wrench className="h-12 w-12 mb-4 opacity-20" />
                        <p>No maintenance activities recorded yet.</p>
                      </div>
                    )}
                  </div>
                </Card>

                <div className="space-y-6">
                  <Card className="p-6 bg-blue-600 text-white border-none shadow-blue-200">
                    <h3 className="font-bold flex items-center gap-2">
                      <Bell className="h-5 w-5" /> Maintenance Alerts
                    </h3>
                    <p className="text-blue-100 text-sm mt-1">Found {stats.maintenanceRequired} assets requiring immediate attention.</p>
                    <div className="mt-4 space-y-3">
                      {assets.filter(a => {
                        if (!a.nextMaintenanceDate) return false;
                        return isBefore(parseISO(a.nextMaintenanceDate), addDays(new Date(), 7));
                      }).slice(0, 3).map(asset => (
                        <div key={asset.id} className="bg-white/10 rounded-lg p-3 backdrop-blur-md">
                          <div className="flex justify-between items-start">
                            <p className="text-sm font-bold">{asset.name}</p>
                            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">Urgent</span>
                          </div>
                          <p className="text-xs text-blue-200 mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Due {format(parseISO(asset.nextMaintenanceDate!), 'MMM dd')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-6">
                    <h3 className="font-bold text-slate-900">Maintenance Stats</h3>
                    <div className="mt-4 space-y-4">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">Success Rate</span>
                        <span className="font-bold text-green-600">98.2%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: '98%' }}></div>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">Avg. Repair Time</span>
                        <span className="font-bold">2.4 Days</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">Annual Spend</span>
                        <span className="font-bold">IDR 12.4M</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals & Overlays */}
      <AnimatePresence>
        {showAssetModal && (
          <AssetModal 
            asset={editingAsset} 
            locations={locations} 
            onClose={() => setShowAssetModal(false)}
            onSave={editingAsset ? (data) => handleUpdateAsset(editingAsset.id, data) : handleCreateAsset}
          />
        )}
        {showLocationModal && (
          <LocationModal 
            location={editingLocation} 
            onClose={() => setShowLocationModal(false)}
            onSave={editingLocation ? (data) => handleUpdateLocation(editingLocation.id, data) : handleCreateLocation}
          />
        )}
        {showLogModal && (
          <MaintenanceLogModal 
            log={editingLog} 
            assets={assets}
            onClose={() => setShowLogModal(false)}
            onSave={editingLog ? (data) => handleUpdateMaintenanceLog(editingLog.id, data) : handleCreateMaintenanceLog}
          />
        )}
        {viewingAsset && (
          <AssetDetailViewer 
            asset={viewingAsset} 
            location={locations.find(l => l.id === viewingAsset.locationId)}
            logs={maintenanceLogs.filter(l => l.assetId === viewingAsset.id)}
            onClose={() => setViewingAsset(null)} 
            onAddLog={handleCreateMaintenanceLog}
          />
        )}
      </AnimatePresence>

      {/* Mobile Navigation */}
      <div className="fixed bottom-0 left-0 z-40 flex h-16 w-full items-center justify-around border-t border-slate-200 bg-white lg:hidden">
        {[
          { id: 'dashboard', icon: LayoutDashboard },
          { id: 'assets', icon: Package },
          { id: 'locations', icon: MapPin },
          { id: 'maintenance', icon: Wrench },
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn("p-2", activeTab === tab.id ? "text-blue-600" : "text-slate-400")}
          >
            <tab.icon className="h-6 w-6" />
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Helper Components ---

function StatCard({ title, value, icon: Icon, color, trend }: { title: string; value: string | number; icon: any; color: string; trend: string }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };
  
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className={cn("rounded-lg p-2", colors[color as keyof typeof colors])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="text-2xl font-bold mt-1 text-slate-900">{value}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-tight text-slate-400">
        {trend}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: AssetStatus }) {
  const styles: Record<AssetStatus, { variant: any }> = {
    "Available": { variant: 'success' },
    "In Use": { variant: 'info' },
    "Under Maintenance": { variant: 'warning' },
    "Retired": { variant: 'default' },
    "Missing": { variant: 'error' },
  };
  return <Badge variant={styles[status].variant}>{status}</Badge>;
}

function AssetModal({ asset, locations, onClose, onSave }: { asset: Asset | null; locations: Location[]; onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState<Partial<Asset>>(
    asset || {
      name: '',
      category: 'IT',
      status: 'Available',
      condition: 'Excellent',
      cost: 0,
      serialNumber: '',
      locationId: locations[0]?.id || '',
    }
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
          <h3 className="text-lg font-bold">{asset ? 'Edit Asset' : 'New Asset Registration'}</h3>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-200 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Asset Name</label>
              <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. MacBook Pro M3" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Category</label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={formData.category} 
                onChange={e => setFormData({ ...formData, category: e.target.value as AssetCategory })}
              >
                {["IT", "Office", "Furniture", "Vehicle", "Machinery", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Serial Number</label>
              <Input value={formData.serialNumber} onChange={e => setFormData({ ...formData, serialNumber: e.target.value })} placeholder="S/N: XXX-XXX" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Purchase Cost (IDR)</label>
              <Input type="number" value={formData.cost} onChange={e => setFormData({ ...formData, cost: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Status</label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={formData.status} 
                onChange={e => setFormData({ ...formData, status: e.target.value as AssetStatus })}
              >
                {["Available", "In Use", "Under Maintenance", "Retired", "Missing"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Condition</label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={formData.condition} 
                onChange={e => setFormData({ ...formData, condition: e.target.value as AssetCondition })}
              >
                {["Excellent", "Good", "Fair", "Poor", "Broken"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Location</label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={formData.locationId} 
                onChange={e => setFormData({ ...formData, locationId: e.target.value })}
              >
                <option value="">Select Location</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(formData)}>{asset ? 'Save Changes' : 'Register Asset'}</Button>
        </div>
      </motion.div>
    </div>
  );
}

function AssetDetailViewer({ asset, location, logs, onClose, onAddLog }: { asset: Asset; location: Location | undefined; logs: MaintenanceLog[]; onClose: () => void; onAddLog: (log: Partial<MaintenanceLog>) => void }) {
  const [showLogForm, setShowLogForm] = useState(false);
  const [logFormData, setLogFormData] = useState<Partial<MaintenanceLog>>({
    assetId: asset.id,
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'Routine',
    status: 'Completed',
    description: '',
    cost: 0,
    performedBy: '',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/20 backdrop-blur-sm">
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl p-0"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/80 p-6 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-5 w-5" /></Button>
            <h3 className="text-xl font-bold">Asset Information</h3>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowLogForm(!showLogForm)}>
            {showLogForm ? 'View Logs' : 'Add Maintenance Log'}
          </Button>
        </div>
        
        <div className="p-8 space-y-8">
           {showLogForm ? (
             <div className="space-y-4">
               <h4 className="text-lg font-bold">New Maintenance Record</h4>
               <div className="grid grid-cols-2 gap-4">
                 <div className="col-span-2">
                   <label className="text-xs font-semibold uppercase text-slate-500">Performed By</label>
                   <Input value={logFormData.performedBy} onChange={e => setLogFormData({ ...logFormData, performedBy: e.target.value })} placeholder="Technician Name" />
                 </div>
                 <div>
                   <label className="text-xs font-semibold uppercase text-slate-500">Date</label>
                   <Input type="date" value={logFormData.date} onChange={e => setLogFormData({ ...logFormData, date: e.target.value })} />
                 </div>
                 <div>
                   <label className="text-xs font-semibold uppercase text-slate-500">Type</label>
                   <select 
                     className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                     value={logFormData.type} 
                     onChange={e => setLogFormData({ ...logFormData, type: e.target.value as any })}
                   >
                     {["Routine", "Repair", "Upgrade", "Inspection"].map(t => <option key={t} value={t}>{t}</option>)}
                   </select>
                 </div>
                 <div className="col-span-2">
                   <label className="text-xs font-semibold uppercase text-slate-500">Description</label>
                   <textarea 
                     className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                     rows={3}
                     value={logFormData.description} 
                     onChange={e => setLogFormData({ ...logFormData, description: e.target.value })}
                     placeholder="Details of the work performed..."
                   />
                 </div>
                 <div>
                   <label className="text-xs font-semibold uppercase text-slate-500">Cost (IDR)</label>
                   <Input type="number" value={logFormData.cost} onChange={e => setLogFormData({ ...logFormData, cost: Number(e.target.value) })} />
                 </div>
                 <div className="flex items-end">
                   <Button className="w-full" onClick={() => { onAddLog(logFormData); setShowLogForm(false); }}>Save Log</Button>
                 </div>
               </div>
             </div>
           ) : (
             <>
               <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-3xl font-black">{asset.name}</h4>
                    <p className="mt-1 text-slate-500">{asset.category} Asset • S/N: {asset.serialNumber || 'N/A'}</p>
                  </div>
                  <StatusBadge status={asset.status} />
               </div>

               <div className="grid grid-cols-2 gap-6">
                  <Card className="p-4 border-none bg-slate-50">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Current Location</p>
                    <div className="mt-2 flex items-center gap-2">
                       <MapPin className="h-5 w-5 text-blue-600" />
                       <span className="font-semibold">{location?.name || 'Unknown'}</span>
                    </div>
                  </Card>
                  <Card className="p-4 border-none bg-slate-50">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Current Condition</p>
                    <div className="mt-2 flex items-center gap-2">
                       <AlertTriangle className={cn("h-5 w-5", asset.condition === 'Excellent' ? 'text-green-500' : 'text-amber-500')} />
                       <span className="font-semibold">{asset.condition}</span>
                    </div>
                  </Card>
               </div>

               <div className="space-y-4">
                  <h5 className="font-bold border-b border-slate-100 pb-2">Technical Details</h5>
                  <div className="grid grid-cols-2 gap-y-4 text-sm">
                    <div>
                      <p className="text-slate-400">Purchase Cost</p>
                      <p className="font-mono font-bold">{formatCurrency(asset.cost || 0)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Registration Date</p>
                      <p className="font-bold">{asset.createdAt?.toDate ? format(asset.createdAt.toDate(), 'PPP') : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Last Maintenance</p>
                      <p className="font-bold">{asset.lastMaintenanceDate ? format(parseISO(asset.lastMaintenanceDate), 'PPP') : 'Never'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Next Service Due</p>
                      <p className="font-bold text-blue-600">{asset.nextMaintenanceDate ? format(parseISO(asset.nextMaintenanceDate), 'PPP') : 'Not Scheduled'}</p>
                    </div>
                  </div>
               </div>

               <div className="space-y-4">
                  <h5 className="font-bold border-b border-slate-100 pb-2">Service History</h5>
                  <div className="space-y-4">
                     {logs.map(log => (
                       <div key={log.id} className="rounded-xl border border-slate-100 p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold uppercase">{log.type}</span>
                            <span className="text-xs text-slate-400">{format(parseISO(log.date), 'PP')}</span>
                          </div>
                          <p className="mt-2 text-sm font-medium">{log.description}</p>
                          <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-50 pt-2">
                            <span>Technician: {log.performedBy}</span>
                            <span>Cost: {formatCurrency(log.cost || 0)}</span>
                          </div>
                       </div>
                     ))}
                     {logs.length === 0 && (
                       <div className="flex flex-col items-center justify-center py-10 text-slate-300">
                         <Calendar className="h-10 w-10 mb-2 opacity-50" />
                         <p>No maintenance logs recorded.</p>
                       </div>
                     )}
                  </div>
               </div>
             </>
           )}
        </div>
      </motion.div>
    </div>
  );
}

function LocationModal({ location, onClose, onSave }: { location: Location | null; onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState<Partial<Location>>(
    location || {
      name: '',
      description: '',
    }
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
          <h3 className="text-lg font-bold">{location ? 'Edit Location' : 'New Location'}</h3>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-200 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase text-slate-500">Location Name</label>
            <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Warehouse A" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-slate-500">Description</label>
            <textarea 
              className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              rows={3}
              value={formData.description} 
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Building, Floor, or specific area details..."
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(formData)}>{location ? 'Save Changes' : 'Create Location'}</Button>
        </div>
      </motion.div>
    </div>
  );
}

function MaintenanceLogModal({ log, assets, onClose, onSave }: { log: MaintenanceLog | null; assets: Asset[]; onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState<Partial<MaintenanceLog>>(
    log || {
      assetId: assets[0]?.id || '',
      date: format(new Date(), 'yyyy-MM-dd'),
      type: 'Routine',
      status: 'Completed',
      description: '',
      cost: 0,
      performedBy: '',
    }
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
          <h3 className="text-lg font-bold">{log ? 'Edit History Record' : 'Schedule New Service'}</h3>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-200 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Asset Targeted</label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={formData.assetId} 
                onChange={e => setFormData({ ...formData, assetId: e.target.value })}
              >
                <option value="">Select Asset</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.name} ({a.serialNumber || 'No S/N'})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Service Date</label>
              <Input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Service Type</label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={formData.type} 
                onChange={e => setFormData({ ...formData, type: e.target.value as any })}
              >
                {["Routine", "Repair", "Upgrade", "Inspection"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Maintenance Description</label>
              <textarea 
                className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                rows={3}
                value={formData.description} 
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Details of the work to be performed..."
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Estimated/Actual Cost (IDR)</label>
              <Input type="number" value={formData.cost} onChange={e => setFormData({ ...formData, cost: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Technician/Vendor</label>
              <Input value={formData.performedBy} onChange={e => setFormData({ ...formData, performedBy: e.target.value })} placeholder="Name of performer" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Status</label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={formData.status} 
                onChange={e => setFormData({ ...formData, status: e.target.value as any })}
              >
                {["Scheduled", "Completed"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(formData)}>{log ? 'Save Changes' : 'Process Entry'}</Button>
        </div>
      </motion.div>
    </div>
  );
}
