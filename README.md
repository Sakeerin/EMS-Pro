# Employee Management System - MERN Stack

A modern, comprehensive Employee Management System built with MongoDB, Express.js, React, and Node.js.

## ✨ Features

### 🔐 Authentication & Authorization
- JWT-based authentication
- Role-based access control (Admin, HR, Manager, Employee)
- Secure password hashing with bcrypt

### 👥 Employee Management
- Complete CRUD operations
- Profile with photo upload
- Department assignment
- Advanced search & filtering

### ⏰ Attendance Tracking
- Real-time check-in/check-out
- Working hours calculation
- Overtime tracking
- Attendance reports

### 🏖️ Leave Management
- Multiple leave types (annual, sick, personal)
- Approval workflow
- Leave balance tracking

### 💰 Payroll
- Salary management
- Automatic payroll calculation
- Payslip generation

### 📊 Dashboard
- Real-time KPIs
- Interactive charts
- Recent activities

### 🎨 Modern UI/UX
- Glassmorphism design
- Dark/Light theme
- Smooth animations
- Fully responsive

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (or local MongoDB)

### Installation

1. **Clone the repository**
```bash
cd Employee-Management-System
```

2. **Setup Backend**
```bash
cd server
npm install
cp .env.example .env
# Edit .env with your MongoDB connection string
```

3. **Setup Frontend**
```bash
cd client
npm install
```

### Configuration

Edit `server/.env`:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.xxxxx.mongodb.net/employee_management
JWT_SECRET=your-secret-key
PORT=5000
CLIENT_URL=http://localhost:5173
```

### Running the Application

1. **Start Backend** (from server folder)
```bash
npm run dev
```

2. **Start Frontend** (from client folder)
```bash
npm run dev
```

3. **Access the app**
- Frontend: http://localhost:5173
- API: http://localhost:5000/api

### First Time Setup

1. Register an admin account at `/register`
2. Create departments at `/departments`
3. Add employees at `/employees/new`

## 📁 Project Structure

```
Employee-Management-System/
├── client/                 # React Frontend
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── context/       # React Context
│   │   ├── pages/         # Route pages
│   │   ├── services/      # API services
│   │   └── styles/        # Global CSS
│   └── package.json
│
├── server/                 # Express Backend
│   ├── config/            # Database config
│   ├── middleware/        # Auth middleware
│   ├── models/            # Mongoose models
│   ├── routes/            # API routes
│   └── package.json
│
└── README.md
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite |
| Styling | Custom CSS + Framer Motion |
| State | React Context + React Query |
| Backend | Node.js + Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcrypt |
| Charts | Recharts |

## 📱 Screenshots

The application features:
- Modern login page with animated background
- Dashboard with KPI cards and charts
- Employee list with search and filters
- Attendance clock widget
- Leave balance cards
- Payroll management with payslips
- Dark/Light theme toggle

## 📄 License

MIT License
