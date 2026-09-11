import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Search,
  KeyRound,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Mail,
  MoreVertical,
  ShieldAlert,
  UserCheck,
  UserX,
  Sparkles,
  Layers,
  Store,
  Check,
  Copy,
  Send,
  Share2,
  ExternalLink,
  MessageSquare,
  QrCode,
  Eye,
  EyeOff,
  Printer
} from 'lucide-react';
import { useRestaurant } from '../context/RestaurantContext';
import { useAuth } from '../context/AuthContext';
import { staffService } from '../services/staffService';
import { getPublicAppOrigin } from '../utils/urlUtils';
import { RestaurantMember, StaffRole } from '../types/auth';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { hasPermission } from '../utils/permissions';

const ROLE_METADATA: Record<
  StaffRole,
  { label: string; color: string; bg: string; border: string; description: string }
> = {
  owner: {
    label: 'Owner',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    description: 'Full restaurant management, staff, financial settings, and billing operations.'
  },
  manager: {
    label: 'Manager',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    description: 'Operations, orders, tables, menu, reports, refunds, and viewing staff.'
  },
  cashier: {
    label: 'Cashier',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    description: 'POS terminal, taking orders, processing payments, and daily drawer summaries.'
  },
  captain: {
    label: 'Captain / Waiter',
    color: 'text-sky-700',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    description: 'Table management, guest sessions, taking orders, and serving KOTs.'
  },
  kitchen: {
    label: 'Kitchen / Chef',
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    description: 'KOT queue, prep workflow, and marking kitchen order tickets ready.'
  },
  accountant: {
    label: 'Accountant',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    description: 'Financial reports, settlement audits, order history, and business analytics.'
  }
};

export const StaffPage: React.FC = () => {
  const { restaurant } = useRestaurant();
  const { user, profile } = useAuth();

  const [staffList, setStaffList] = useState<RestaurantMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Notification banners
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Add Staff Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<StaffRole>('cashier');
  const [newInitialPassword, setNewInitialPassword] = useState('Staff@123');
  const [showInitialPassword, setShowInitialPassword] = useState(false);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Change Role Modal State
  const [roleModalMember, setRoleModalMember] = useState<RestaurantMember | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<StaffRole>('cashier');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Deactivate/Activate Confirm State
  const [statusModalMember, setStatusModalMember] = useState<RestaurantMember | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Delete Confirm State
  const [deleteModalMember, setDeleteModalMember] = useState<RestaurantMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Password reset & staff QR modals state
  const [resettingEmail, setResettingEmail] = useState<string | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Created Staff Credentials & QR Modal State
  const [createdCredentialsModal, setCreatedCredentialsModal] = useState<{
    name: string;
    email: string;
    role: string;
    invitationUrl: string;
    qrCodeDataUrl: string;
    statusMessage: string;
  } | null>(null);

  // View QR Code Modal State for roster members
  const [viewQrModalMember, setViewQrModalMember] = useState<{
    member: RestaurantMember;
    qrCodeDataUrl: string;
  } | null>(null);

  const userRole = profile?.role || 'owner';
  const canManageStaff = hasPermission(userRole, 'manage_staff');

  const fetchStaff = async () => {
    if (!restaurant?.restaurantId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const members = await staffService.getStaffMembers(restaurant.restaurantId);
      setStaffList(members);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load staff roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [restaurant?.restaurantId]);

  const handleShowQrModal = async (member: RestaurantMember) => {
    if (!member.email) return;
    try {
      const qrDataUrl = await staffService.generateStaffQRCode(member.email);
      setViewQrModalMember({
        member,
        qrCodeDataUrl: qrDataUrl
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate staff QR Code.');
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant?.restaurantId) return;
    setIsSubmittingAdd(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await staffService.addStaffMember(restaurant.restaurantId, {
        displayName: newName,
        email: newEmail,
        role: newRole
      });

      setSuccessMessage(result.message);
      setIsAddModalOpen(false);

      const invUrl = result.member.invitationUrl || `${getPublicAppOrigin()}/accept-invitation?token=${result.member.invitationToken}`;

      setCreatedCredentialsModal({
        name: newName,
        email: newEmail,
        role: newRole,
        invitationUrl: invUrl,
        qrCodeDataUrl: result.qrCodeDataUrl || '',
        statusMessage: result.message
      });

      setNewName('');
      setNewEmail('');
      setNewRole('cashier');
      await fetchStaff();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add staff member.');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!restaurant?.restaurantId || !roleModalMember) return;
    setIsUpdatingRole(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await staffService.updateStaffRole(restaurant.restaurantId, roleModalMember.memberId, selectedNewRole);
      setSuccessMessage(`Role updated to ${ROLE_METADATA[selectedNewRole].label} for ${roleModalMember.displayName || roleModalMember.email}.`);
      setRoleModalMember(null);
      await fetchStaff();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update staff role.');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!restaurant?.restaurantId || !statusModalMember) return;
    setIsUpdatingStatus(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const targetActive = !statusModalMember.isActive;

    try {
      await staffService.setStaffActiveStatus(restaurant.restaurantId, statusModalMember.memberId, targetActive);
      setSuccessMessage(`Staff member ${statusModalMember.displayName || statusModalMember.email} has been ${targetActive ? 'activated' : 'deactivated'}.`);
      setStatusModalMember(null);
      await fetchStaff();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update staff status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDeleteStaff = async () => {
    if (!restaurant?.restaurantId || !deleteModalMember) return;
    setIsDeleting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await staffService.removeStaffMember(restaurant.restaurantId, deleteModalMember.memberId);
      setSuccessMessage(`Staff membership revoked for ${deleteModalMember.displayName || deleteModalMember.email}.`);
      setDeleteModalMember(null);
      await fetchStaff();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove staff member.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSendPasswordReset = async (email: string) => {
    if (!email) return;
    setResettingEmail(email);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await staffService.sendStaffPasswordReset(email);
      if (res.success) {
        setSuccessMessage(res.message);
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send password setup link.');
    } finally {
      setResettingEmail(null);
    }
  };

  const filteredStaff = staffList.filter((m) => {
    const query = searchQuery.toLowerCase();
    const matchesQuery =
      !query ||
      (m.displayName && m.displayName.toLowerCase().includes(query)) ||
      (m.email && m.email.toLowerCase().includes(query)) ||
      (m.role && m.role.toLowerCase().includes(query));

    const matchesRole = roleFilter === 'all' || m.role === roleFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && m.isActive) ||
      (statusFilter === 'inactive' && !m.isActive);

    return matchesQuery && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Staff & Role Management</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage outlet team accounts, assign RBAC operational roles, and enforce strict tenant security.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStaff}
            isLoading={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>

          {canManageStaff && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <UserPlus className="w-4 h-4" />
              Add Staff Member
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-700 hover:text-red-900 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search staff by name, email, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Roles</option>
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
            <option value="captain">Captain / Waiter</option>
            <option value="kitchen">Kitchen / Chef</option>
            <option value="accountant">Accountant</option>
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Accounts</option>
            <option value="inactive">Deactivated Accounts</option>
          </select>
        </div>
      </div>

      {/* Staff Roster Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Active Team ({filteredStaff.length} Members)
            </span>
          </div>
          <span className="text-xs text-slate-400">
            Outlet: <strong className="text-slate-700">{restaurant?.name}</strong>
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500" />
            <p className="text-xs">Loading staff team and permissions...</p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Users className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">No staff members found</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || roleFilter !== 'all' || statusFilter !== 'all'
                ? 'Try adjusting your search query or filters.'
                : 'Click "Add Staff Member" above to invite your first employee to this restaurant outlet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-6">Member & Email</th>
                  <th className="py-3.5 px-4">Role & Scope</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Account ID</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map((member) => {
                  const meta = ROLE_METADATA[member.role] || ROLE_METADATA.cashier;
                  const isOwner = member.role === 'owner' || member.isOwner;
                  const isSelf = member.userId === user?.uid;

                  return (
                    <tr
                      key={member.memberId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        !member.isActive ? 'bg-slate-50/40 opacity-75' : ''
                      }`}
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs uppercase ${
                              isOwner
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            {(member.displayName || member.email || 'U').substring(0, 2)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-xs">
                                {member.displayName || 'Unnamed Staff'}
                              </span>
                              {isSelf && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 font-semibold border border-indigo-100">
                                  You
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 text-slate-400" />
                              {member.email || 'No email associated'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${meta.bg} ${meta.color} ${meta.border}`}
                          title={meta.description}
                        >
                          <Shield className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        {!member.isActive || member.status === 'inactive' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Deactivated
                          </span>
                        ) : member.status === 'pending_setup' || !member.authLinked ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200"
                            title="Invitation created. Account will link upon employee's first authenticated sign-in."
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                            Pending Setup
                          </span>
                        ) : member.invitationStatus === 'invitation_failed' ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200"
                            title={member.invitationError || 'Invitation setup error'}
                          >
                            <AlertCircle className="w-3 h-3 text-rose-500" />
                            Invite Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-200/60 truncate max-w-[120px] inline-block">
                          {member.userId || member.memberId}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View QR Code Button */}
                          {member.email && (
                            <button
                              onClick={() => handleShowQrModal(member)}
                              title="View Staff QR Code & Login Link"
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-indigo-200/80"
                            >
                              <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                              <span className="hidden sm:inline">QR Code</span>
                            </button>
                          )}

                          {/* Send Firebase Setup Email Link */}
                          {member.email && (
                            <button
                              onClick={() => handleSendPasswordReset(member.email!)}
                              disabled={resettingEmail === member.email}
                              title="Send official Firebase Auth password setup & account verification email link"
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-amber-200/90"
                            >
                              <Mail className={`w-3.5 h-3.5 text-amber-600 ${resettingEmail === member.email ? 'animate-spin' : ''}`} />
                              <span className="hidden sm:inline">Firebase Link</span>
                            </button>
                          )}

                          {canManageStaff && !isOwner && !isSelf && (
                            <>
                              {/* Change Role Button */}
                              <button
                                onClick={() => {
                                  setSelectedNewRole(member.role);
                                  setRoleModalMember(member);
                                }}
                                title="Change Staff Role"
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors font-medium"
                              >
                                <Shield className="w-4 h-4" />
                              </button>

                              {/* Toggle Active/Inactive */}
                              <button
                                onClick={() => setStatusModalMember(member)}
                                title={member.isActive ? 'Deactivate staff member' : 'Activate staff member'}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  member.isActive
                                    ? 'text-slate-500 hover:text-amber-600 hover:bg-amber-50'
                                    : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'
                                }`}
                              >
                                {member.isActive ? (
                                  <UserX className="w-4 h-4" />
                                ) : (
                                  <UserCheck className="w-4 h-4" />
                                )}
                              </button>

                              {/* Remove Staff */}
                              <button
                                onClick={() => setDeleteModalMember(member)}
                                title="Revoke staff membership"
                                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role Explanations Reference */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          Role-Based Access Control (RBAC) Matrix Reference
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.keys(ROLE_METADATA) as StaffRole[]).map((roleKey) => {
            const rMeta = ROLE_METADATA[roleKey];
            return (
              <div key={roleKey} className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs">
                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${rMeta.bg} ${rMeta.color} mb-1.5`}>
                  {rMeta.label}
                </span>
                <p className="text-[11px] text-slate-600 leading-relaxed">{rMeta.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL 1: ADD STAFF MEMBER */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Invite New Staff Member</h3>
                  <p className="text-xs text-slate-500">Generate a secure invitation link & QR code</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. ramesh@restaurantos.io"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Staff Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as StaffRole)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900 font-medium"
                >
                  <option value="manager">Manager — Full Operations & Reports</option>
                  <option value="cashier">Cashier — POS Terminal & Billing</option>
                  <option value="captain">Captain / Waiter — Tables & Orders</option>
                  <option value="kitchen">Kitchen / Chef — KOT & Prep Queue</option>
                  <option value="accountant">Accountant — Financials & Auditing</option>
                </select>
              </div>

              <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  The employee will receive an invitation link or scan the QR code to log in / register, verify their email address, and claim their staff role securely.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSubmittingAdd}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5"
                >
                  <QrCode className="w-4 h-4" />
                  Generate Invitation & QR
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CHANGE ROLE */}
      {roleModalMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Modify Staff Role</h3>
                  <p className="text-xs text-slate-500">
                    {roleModalMember.displayName || roleModalMember.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRoleModalMember(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select New Role
                </label>
                <select
                  value={selectedNewRole}
                  onChange={(e) => setSelectedNewRole(e.target.value as StaffRole)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900 font-medium"
                >
                  <option value="manager">Manager</option>
                  <option value="cashier">Cashier</option>
                  <option value="captain">Captain / Waiter</option>
                  <option value="kitchen">Kitchen / Chef</option>
                  <option value="accountant">Accountant</option>
                </select>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                <p className="font-semibold text-slate-900 mb-1">Permissions Scope:</p>
                <p>{ROLE_METADATA[selectedNewRole].description}</p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRoleModalMember(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  isLoading={isUpdatingRole}
                  onClick={handleUpdateRole}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Confirm Role Change
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: TOGGLE ACTIVE / DEACTIVATE */}
      {statusModalMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-scaleIn">
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  statusModalMember.isActive
                    ? 'bg-amber-50 text-amber-600 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                }`}
              >
                {statusModalMember.isActive ? (
                  <UserX className="w-5 h-5" />
                ) : (
                  <UserCheck className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {statusModalMember.isActive ? 'Deactivate Staff Account?' : 'Reactivate Staff Account?'}
                </h3>
                <p className="text-xs text-slate-500">
                  {statusModalMember.displayName || statusModalMember.email}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              {statusModalMember.isActive
                ? 'Deactivating this staff member will immediately revoke their access to POS, Kitchen, Captain, and restaurant data on reconnect. Historical orders and audit records remain fully preserved.'
                : 'Reactivating this staff account will restore their operational permissions and allow them to log into this restaurant outlet.'}
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStatusModalMember(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={statusModalMember.isActive ? 'danger' : 'primary'}
                size="sm"
                isLoading={isUpdatingStatus}
                onClick={handleToggleStatus}
                className={!statusModalMember.isActive ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
              >
                {statusModalMember.isActive ? 'Deactivate Account' : 'Reactivate Account'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE / REVOKE STAFF MEMBERSHIP */}
      {deleteModalMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-scaleIn">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Revoke Staff Membership?</h3>
                <p className="text-xs text-slate-500">
                  {deleteModalMember.displayName || deleteModalMember.email}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Are you sure you want to permanently remove this staff member from <strong className="text-slate-900">{restaurant?.name}</strong>? They will no longer be able to access this outlet. All historical orders and KOT records created by this member remain safely preserved.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleteModalMember(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                isLoading={isDeleting}
                onClick={handleDeleteStaff}
              >
                Permanently Remove Staff
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: STAFF INVITATION CREATED & QR CODE */}
      {createdCredentialsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-scaleIn text-center my-auto max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-3">
              <Send className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Staff Invitation Created!</h3>
            <p className="text-xs text-slate-500 mt-1">
              Pending invitation generated for <strong className="text-slate-900">{createdCredentialsModal.name}</strong> ({createdCredentialsModal.email})
            </p>

            <div className="my-5 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Assigned Role:</span>
                <span className="font-bold text-indigo-600 uppercase tracking-wide">{createdCredentialsModal.role}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Email Address:</span>
                <span className="font-mono text-slate-900 font-bold">{createdCredentialsModal.email}</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                <span className="text-slate-500 font-medium shrink-0">Invitation Link:</span>
                <div className="flex items-center gap-2 overflow-hidden ml-2">
                  <span className="font-mono text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 text-[11px] truncate max-w-[200px]">
                    {createdCredentialsModal.invitationUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (navigator.clipboard && createdCredentialsModal.invitationUrl) {
                        navigator.clipboard.writeText(createdCredentialsModal.invitationUrl);
                        setCopiedCreds(true);
                        setTimeout(() => setCopiedCreds(false), 2000);
                      }
                    }}
                    className="text-[11px] font-semibold text-slate-600 hover:text-indigo-600 flex items-center gap-1 shrink-0 bg-white px-2 py-1 rounded border border-slate-200 shadow-2xs"
                  >
                    {copiedCreds ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCreds ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            {/* Verification & Setup Info Banner */}
            <div className="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-3.5 mb-5 text-left text-xs text-indigo-950 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-indigo-900">Next Steps for Staff Member</p>
                <p className="text-[11px] text-indigo-800 mt-0.5 leading-relaxed">
                  Share this invitation link or QR code with <strong>{createdCredentialsModal.name}</strong>. The employee will open the link or scan the QR code to sign in or register with their verified email address and claim their staff role.
                </p>
              </div>
            </div>

            {/* QR Code Container */}
            {createdCredentialsModal.qrCodeDataUrl && (
              <div className="bg-gradient-to-b from-indigo-50/50 to-slate-50 border border-indigo-100 rounded-2xl p-4 text-center mb-5">
                <p className="text-xs font-bold text-indigo-900 flex items-center justify-center gap-1.5 mb-2">
                  <QrCode className="w-4 h-4 text-indigo-600" />
                  Staff Mobile Invitation Scan (QR Code)
                </p>
                <div className="bg-white p-3 rounded-xl inline-block border border-slate-200 shadow-xs mx-auto">
                  <img
                    src={createdCredentialsModal.qrCodeDataUrl}
                    alt="Staff Invitation QR Code"
                    className="w-44 h-44 mx-auto"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Staff can scan this QR code with their smartphone camera to open the invitation link directly!
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Hi ${createdCredentialsModal.name},\nYou have been invited to join ${restaurant?.name || 'RestaurantOS'} as a ${createdCredentialsModal.role.toUpperCase()}.\n\nClick this link to accept your invitation and activate your account:\n${createdCredentialsModal.invitationUrl}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors text-center shadow-xs"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Share Link on WhatsApp
              </a>

              <button
                type="button"
                onClick={() => {
                  const printWindow = window.open('', '_blank');
                  if (printWindow) {
                    printWindow.document.write(`
                      <html>
                        <head><title>Staff Invitation - ${createdCredentialsModal.name}</title></head>
                        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                          <h2>${restaurant?.name || 'RestaurantOS'} - Staff Invitation Card</h2>
                          <h3>${createdCredentialsModal.name} (${createdCredentialsModal.role.toUpperCase()})</h3>
                          <p><strong>Email:</strong> ${createdCredentialsModal.email}</p>
                          <p style="word-break: break-all; font-family: monospace;"><strong>Link:</strong> ${createdCredentialsModal.invitationUrl}</p>
                          <img src="${createdCredentialsModal.qrCodeDataUrl}" style="width: 250px; height: 250px; margin: 20px auto;" />
                          <p>Scan QR code with smartphone camera to accept invitation instantly.</p>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                    printWindow.focus();
                    printWindow.print();
                  }
                }}
                className="flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition-colors text-center shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Invitation Card
              </button>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreatedCredentialsModal(null)}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: VIEW STAFF QR CODE MODAL */}
      {viewQrModalMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-scaleIn text-center">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 text-left">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {viewQrModalMember.member.displayName || 'Staff QR Code'}
                  </h3>
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                    {viewQrModalMember.member.role} • {viewQrModalMember.member.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewQrModalMember(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                ✕
              </button>
            </div>

            {viewQrModalMember.qrCodeDataUrl && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 my-2 text-center">
                <img
                  src={viewQrModalMember.qrCodeDataUrl}
                  alt="Staff QR Code"
                  className="w-48 h-48 mx-auto border border-white rounded-xl shadow-xs"
                />
                <p className="text-xs text-slate-500 mt-2 font-medium">
                  Scan to open mobile login directly for <span className="font-bold text-slate-800">{viewQrModalMember.member.email}</span>
                </p>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => {
                  const url = `${getPublicAppOrigin()}/login?email=${encodeURIComponent(viewQrModalMember.member.email || '')}`;
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(url);
                    setSuccessMessage(`Login URL copied for ${viewQrModalMember.member.displayName || viewQrModalMember.member.email}`);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl transition-colors border border-indigo-200"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Login URL
              </button>

              <button
                onClick={() => handleSendPasswordReset(viewQrModalMember.member.email!)}
                disabled={resettingEmail === viewQrModalMember.member.email}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors border border-slate-200"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                Send Password Reset Email
              </button>
            </div>

            <div className="mt-4 flex items-center justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setViewQrModalMember(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
