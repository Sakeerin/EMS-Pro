import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the server directory (parent of scripts)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const seedDatabase = async () => {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📦 Connected to MongoDB');

        // Clear existing data (optional - comment out if you want to keep existing data)
        console.log('🗑️  Clearing existing data...');
        await User.deleteMany({});
        await Employee.deleteMany({});
        await Department.deleteMany({});

        // Create departments
        console.log('🏢 Creating departments...');
        const departments = await Department.create([
            { name: 'Engineering', code: 'ENG', description: 'Software Development Team' },
            { name: 'Human Resources', code: 'HR', description: 'HR and People Operations' },
            { name: 'Finance', code: 'FIN', description: 'Finance and Accounting' },
            { name: 'Marketing', code: 'MKT', description: 'Marketing and Communications' }
        ]);

        const engDept = departments.find(d => d.code === 'ENG');
        const hrDept = departments.find(d => d.code === 'HR');

        // Create employees
        console.log('👥 Creating employees...');
        const employees = await Employee.create([
            {
                employeeId: 'EMP001',
                firstName: 'John',
                lastName: 'Admin',
                email: 'admin@company.com',
                phone: '0801234567',
                department: engDept._id,
                position: 'System Administrator',
                hireDate: new Date('2020-01-15'),
                salary: 80000,
                gender: 'male',
                status: 'active'
            },
            {
                employeeId: 'EMP002',
                firstName: 'Sarah',
                lastName: 'HR Manager',
                email: 'hr@company.com',
                phone: '0801234568',
                department: hrDept._id,
                position: 'HR Manager',
                hireDate: new Date('2021-03-01'),
                salary: 65000,
                gender: 'female',
                status: 'active'
            },
            {
                employeeId: 'EMP003',
                firstName: 'Mike',
                lastName: 'Developer',
                email: 'employee@company.com',
                phone: '0801234569',
                department: engDept._id,
                position: 'Software Developer',
                hireDate: new Date('2022-06-15'),
                salary: 50000,
                gender: 'male',
                status: 'active'
            }
        ]);

        const adminEmployee = employees.find(e => e.employeeId === 'EMP001');
        const hrEmployee = employees.find(e => e.employeeId === 'EMP002');
        const devEmployee = employees.find(e => e.employeeId === 'EMP003');

        // Create users linked to employees
        console.log('👤 Creating users...');
        await User.create([
            {
                email: 'admin@company.com',
                password: 'password123',
                role: 'admin',
                employee: adminEmployee._id,
                isActive: true
            },
            {
                email: 'hr@company.com',
                password: 'password123',
                role: 'hr',
                employee: hrEmployee._id,
                isActive: true
            },
            {
                email: 'employee@company.com',
                password: 'password123',
                role: 'employee',
                employee: devEmployee._id,
                isActive: true
            }
        ]);

        console.log('✅ Database seeded successfully!');
        console.log('');
        console.log('📋 Test Accounts:');
        console.log('─────────────────────────────────────────');
        console.log('Admin:    admin@company.com / password123');
        console.log('HR:       hr@company.com / password123');
        console.log('Employee: employee@company.com / password123');
        console.log('─────────────────────────────────────────');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
};

seedDatabase();
