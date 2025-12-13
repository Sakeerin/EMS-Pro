# User Management & Role-Based Access Control Implementation

This plan adds a comprehensive User Management feature with a new 4-tier role system and enhanced page-level permissions.

## Role Structure & Permissions

| Feature | SuperAdmin | Admin | HR | Employee |
|---------|------------|-------|-----|----------|
| **User Management** | ✅ Full | ❌ | ❌ | ❌ |
| **Employees - View** | ✅ | ✅ | ✅ | ❌ |
| **Employees - Add/Edit** | ✅ | ✅ | ✅ | ❌ |
| **Employees - Delete** | ✅ | ✅ | ❌ | ❌ |
| **Departments - View** | ✅ | ✅ | ✅ | ❌ |
| **Departments - Add/Edit/Delete** | ✅ | ✅ | ✅ | ❌ |
| **Attendance** | ✅ All | ✅ All | ✅ All | ✅ Own only |
| **Leaves** | ✅ All + Approve | ✅ All + Approve | ✅ All + Approve | ✅ Own only (Calendar view) |
| **Payroll** | ✅ All + Manage | ✅ All + Manage | ✅ View All | ✅ Own only (Download slips) |
| **Dashboard** | ✅ Full KPIs | ✅ Full KPIs | ✅ Full KPIs | ✅ Own info only |
| **Settings** | ✅ | ✅ | ✅ | ✅ |

---

## Proposed Changes

### Phase 1: Backend - Role System Update

#### [MODIFY] [User.js](file:///d:/Projects/Employee-Management-System/server/models/User.js)

Update role enum from `['admin', 'hr', 'manager', 'employee']` to:
```javascript
role: {
    type: String,
    enum: ['superadmin', 'admin', 'hr', 'employee'],
    default: 'employee'
}
```

---

#### [MODIFY] [auth.js](file:///d:/Projects/Employee-Management-System/server/middleware/auth.js)

Update the `authorize` middleware to handle new roles and add helper functions:
- `isSuperAdmin(role)` - Check if SuperAdmin
- `canManageUsers(role)` - Only SuperAdmin
- `canDeleteEmployee(role)` - SuperAdmin or Admin
- `canManageDepartments(role)` - SuperAdmin, Admin, or HR

---

#### [NEW] [user.routes.js](file:///d:/Projects/Employee-Management-System/server/routes/user.routes.js)

Create new Express routes for user management (**SuperAdmin only**):

**Endpoints:**
- `GET /api/users` - List all users with pagination, search, filtering
- `GET /api/users/:id` - Get single user details
- `POST /api/users` - Create new user with role assignment
- `PUT /api/users/:id` - Update user (email, role, isActive)
- `PUT /api/users/:id/link-employee` - Link user to employee profile
- `DELETE /api/users/:id` - Soft delete (deactivate user)

---

#### [MODIFY] [employee.routes.js](file:///d:/Projects/Employee-Management-System/server/routes/employee.routes.js)

Update delete endpoint to require `authorize('superadmin', 'admin')` instead of allowing HR.

---

#### [MODIFY] [index.js](file:///d:/Projects/Employee-Management-System/server/index.js)

Register the new user routes.

---

### Phase 2: Frontend - Role Context & API

#### [MODIFY] [AuthContext.jsx](file:///d:/Projects/Employee-Management-System/client/src/context/AuthContext.jsx)

Update role helpers:
```javascript
const isSuperAdmin = user?.role === 'superadmin';
const isAdmin = user?.role === 'admin' || isSuperAdmin;
const isHR = user?.role === 'hr' || isAdmin;
const isEmployee = user?.role === 'employee';

// Permission helpers
const canManageUsers = isSuperAdmin;
const canDeleteEmployee = isSuperAdmin || user?.role === 'admin';
const canEditEmployee = isHR || isAdmin || isSuperAdmin;
```

---

#### [MODIFY] [api.js](file:///d:/Projects/Employee-Management-System/client/src/services/api.js)

Add new `userAPI` object:
```javascript
export const userAPI = {
    getAll: (params) => api.get('/users', { params }),
    getById: (id) => api.get(`/users/${id}`),
    create: (data) => api.post('/users', data),
    update: (id, data) => api.put(`/users/${id}`, data),
    linkEmployee: (id, employeeId) => api.put(`/users/${id}/link-employee`, { employeeId }),
    delete: (id) => api.delete(`/users/${id}`)
};
```

---

### Phase 3: Frontend - User Management Page

#### [NEW] [UserList.jsx](file:///d:/Projects/Employee-Management-System/client/src/pages/users/UserList.jsx)

Main user management page (**SuperAdmin only**) featuring:
- Data table: Email, Role, Linked Employee, Status, Last Login, Actions
- Search by email
- Filter by role and status
- Create User modal with role dropdown
- Edit User modal
- Link to Employee functionality
- Activate/Deactivate toggle
- Modern glassmorphism design

---

#### [NEW] [UserList.css](file:///d:/Projects/Employee-Management-System/client/src/pages/users/UserList.css)

Styles with:
- Role badges: SuperAdmin (purple), Admin (blue), HR (green), Employee (gray)
- Status indicators (active/inactive)
- Modal forms
- Consistent with existing pages

---

### Phase 4: Frontend - Employee Dashboard Update

#### [MODIFY] [Dashboard.jsx](file:///d:/Projects/Employee-Management-System/client/src/pages/dashboard/Dashboard.jsx)

Conditional rendering based on role:
- **SuperAdmin/Admin/HR**: Show full dashboard with all KPIs, charts, recent activities
- **Employee**: Show personal dashboard only:
  - Welcome card with name and position
  - Today's attendance status
  - Leave balance summary
  - Recent payslips
  - Quick actions (Check In/Out, Request Leave)

---

### Phase 5: Frontend - Leave Calendar View

#### [MODIFY] [LeavePage.jsx](file:///d:/Projects/Employee-Management-System/client/src/pages/leaves/LeavePage.jsx)

Add calendar view for employees:
- Monthly calendar showing approved/pending leaves
- Color-coded leave types
- Click on date to request new leave
- Toggle between calendar and list view
- For admins: show team leaves in calendar

---

### Phase 6: Frontend - Payroll Slip Download

#### [MODIFY] [PayrollPage.jsx](file:///d:/Projects/Employee-Management-System/client/src/pages/payroll/PayrollPage.jsx)

Employee-specific features:
- List of personal payslips by month
- Download PDF button for each slip
- Year filter
- Summary of YTD earnings

#### [MODIFY] [payroll.routes.js](file:///d:/Projects/Employee-Management-System/server/routes/payroll.routes.js)

Add endpoint:
- `GET /api/payroll/:id/download` - Generate and download PDF payslip

---

### Phase 7: Frontend - Navigation & Routing

#### [MODIFY] [App.jsx](file:///d:/Projects/Employee-Management-System/client/src/App.jsx)

Update routes with new role restrictions:
```jsx
// Users - SuperAdmin only
<Route path="users" element={
    <ProtectedRoute roles={['superadmin']}>
        <UserList />
    </ProtectedRoute>
} />

// Employees - SuperAdmin, Admin, HR only (Employee sees only own profile)
<Route path="employees" element={
    <ProtectedRoute roles={['superadmin', 'admin', 'hr']}>
        <EmployeeList />
    </ProtectedRoute>
} />
```

---

#### [MODIFY] [Sidebar.jsx](file:///d:/Projects/Employee-Management-System/client/src/components/layout/Sidebar.jsx)

Update menu items with new role visibility:
```javascript
const menuItems = [
    { path: '/dashboard', icon: FiHome, label: 'Dashboard' },
    { path: '/users', icon: FiUserCheck, label: 'Users', roles: ['superadmin'] },
    { path: '/employees', icon: FiUsers, label: 'Employees', roles: ['superadmin', 'admin', 'hr'] },
    { path: '/departments', icon: FiLayers, label: 'Departments', roles: ['superadmin', 'admin', 'hr'] },
    { path: '/attendance', icon: FiClock, label: 'Attendance' },
    { path: '/leaves', icon: FiCalendar, label: 'Leaves' },
    { path: '/payroll', icon: FiDollarSign, label: 'Payroll' },
    { path: '/settings', icon: FiSettings, label: 'Settings' },
];
```

---

## Data Migration

> [!IMPORTANT]
> Existing users with role `'admin'` should be migrated to `'superadmin'` and role `'manager'` should be migrated to `'admin'` or removed.

---

## Verification Plan

### Manual Verification

1. **SuperAdmin Tests:**
   - Can access User Management page
   - Can create, edit, delete users
   - Can assign any role
   - Full access to all pages

2. **Admin Tests:**
   - Cannot see Users menu item
   - Cannot access /users route (redirects)
   - Can manage employees (add/edit/delete)
   - Full dashboard access

3. **HR Tests:**
   - Cannot delete employees (button hidden/disabled)
   - Can add/edit employees
   - Can manage departments
   - Full dashboard access

4. **Employee Tests:**
   - Only sees Dashboard, Attendance, Leaves, Payroll, Settings
   - Dashboard shows personal info only
   - Leaves page shows calendar view
   - Payroll page shows own slips with download
