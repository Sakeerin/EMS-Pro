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

// Thai banks for realistic data
const thaiBanks = [
    'Bangkok Bank',
    'Kasikorn Bank',
    'Siam Commercial Bank',
    'Krungthai Bank',
    'Bank of Ayudhya',
    'TMB Thanachart Bank',
    'Government Savings Bank'
];

// Helper function to generate Thai phone numbers
const generatePhone = () => `08${Math.floor(10000000 + Math.random() * 90000000)}`;

// Helper function to generate bank account number
const generateBankAccount = () => String(Math.floor(1000000000 + Math.random() * 9000000000));

// Helper function to generate random date of birth (age 22-60)
const generateDOB = () => {
    const age = 22 + Math.floor(Math.random() * 38);
    const year = new Date().getFullYear() - age;
    const month = Math.floor(Math.random() * 12);
    const day = 1 + Math.floor(Math.random() * 28);
    return new Date(year, month, day);
};

// Helper function to generate hire date
const generateHireDate = (yearsAgo = 10) => {
    const months = Math.floor(Math.random() * yearsAgo * 12);
    const date = new Date();
    date.setMonth(date.getMonth() - months);
    return date;
};

const seedDatabase = async () => {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📦 Connected to MongoDB');

        // Clear existing data
        console.log('🗑️  Clearing existing data...');
        await User.deleteMany({});
        await Employee.deleteMany({});
        await Department.deleteMany({});

        // ========================================
        // CREATE DEPARTMENTS
        // ========================================
        console.log('🏢 Creating departments...');
        const departments = await Department.create([
            {
                name: 'Executive Office',
                code: 'EXEC',
                description: 'Executive Leadership and Strategy',
                location: 'Floor 10',
                budget: 5000000
            },
            {
                name: 'Engineering',
                code: 'ENG',
                description: 'Software Development and Technology',
                location: 'Floor 5',
                budget: 3000000
            },
            {
                name: 'Human Resources',
                code: 'HR',
                description: 'People Operations and Talent Management',
                location: 'Floor 3',
                budget: 1500000
            },
            {
                name: 'Finance',
                code: 'FIN',
                description: 'Finance, Accounting and Treasury',
                location: 'Floor 4',
                budget: 2000000
            },
            {
                name: 'Marketing',
                code: 'MKT',
                description: 'Marketing, Branding and Communications',
                location: 'Floor 6',
                budget: 2500000
            },
            {
                name: 'Sales',
                code: 'SALES',
                description: 'Sales and Business Development',
                location: 'Floor 7',
                budget: 3500000
            },
            {
                name: 'Operations',
                code: 'OPS',
                description: 'Operations and Logistics',
                location: 'Floor 2',
                budget: 2000000
            },
            {
                name: 'IT Support',
                code: 'IT',
                description: 'IT Infrastructure and Support Services',
                location: 'Floor 1',
                budget: 1800000
            },
            {
                name: 'Legal',
                code: 'LEGAL',
                description: 'Legal Affairs and Compliance',
                location: 'Floor 4',
                budget: 1200000
            },
            {
                name: 'Customer Service',
                code: 'CS',
                description: 'Customer Support and Success',
                location: 'Floor 2',
                budget: 1500000
            }
        ]);

        // Create department lookup
        const deptMap = {};
        departments.forEach(d => { deptMap[d.code] = d._id; });

        // ========================================
        // CREATE EMPLOYEES BY LEVEL
        // ========================================
        console.log('👥 Creating employees...');

        // Store all employees
        const allEmployees = [];
        let empCounter = 1;

        const getEmpId = () => `EMP${String(empCounter++).padStart(4, '0')}`;

        // Helper to create employee data
        const createEmployee = (firstName, lastName, email, dept, position, level, salary, gender = 'male', manager = null) => ({
            employeeId: getEmpId(),
            firstName,
            lastName,
            email,
            phone: generatePhone(),
            department: deptMap[dept],
            position,
            employeeLevel: level,
            manager,
            dateOfBirth: generateDOB(),
            gender,
            hireDate: generateHireDate(level === 'ceo' ? 15 : level === 'c-level' ? 10 : level === 'vp' ? 8 : level === 'manager' ? 5 : 3),
            salary,
            status: 'active',
            address: {
                street: `${100 + Math.floor(Math.random() * 900)} ${['Sukhumvit', 'Silom', 'Sathorn', 'Rama IX', 'Ratchadaphisek'][Math.floor(Math.random() * 5)]} Road`,
                city: 'Bangkok',
                state: 'Bangkok',
                zipCode: `10${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
                country: 'Thailand'
            },
            emergencyContact: {
                name: `${['Somchai', 'Somporn', 'Somsak', 'Somying', 'Somwang'][Math.floor(Math.random() * 5)]} ${lastName}`,
                phone: generatePhone(),
                relationship: ['Spouse', 'Parent', 'Sibling'][Math.floor(Math.random() * 3)]
            },
            bankAccount: {
                bankName: thaiBanks[Math.floor(Math.random() * thaiBanks.length)],
                accountNumber: generateBankAccount(),
                accountName: `${firstName} ${lastName}`
            },
            family: {
                father: { firstName: 'Somchai', lastName, occupation: 'Retired', phone: generatePhone() },
                mother: { firstName: 'Somying', lastName, occupation: 'Homemaker', phone: generatePhone() },
                spouse: { firstName: '', lastName: '', occupation: '', phone: '' },
                numberOfChildren: Math.floor(Math.random() * 3)
            },
            leaveBalance: {
                annual: 12,
                sick: 30,
                personal: 5
            }
        });

        // ========================================
        // LEVEL 1: CEO
        // ========================================
        const ceo = await Employee.create(
            createEmployee('Prasert', 'Wattanakul', 'ceo@company.com', 'EXEC', 'Chief Executive Officer', 'ceo', 500000, 'male')
        );
        allEmployees.push(ceo);

        // ========================================
        // LEVEL 2: C-LEVEL EXECUTIVES
        // ========================================
        const cLevelData = [
            createEmployee('Supaporn', 'Chaisiri', 'cto@company.com', 'ENG', 'Chief Technology Officer', 'c-level', 350000, 'female', ceo._id),
            createEmployee('Wichai', 'Suksawat', 'cfo@company.com', 'FIN', 'Chief Financial Officer', 'c-level', 350000, 'male', ceo._id),
            createEmployee('Naree', 'Bunyasarn', 'coo@company.com', 'OPS', 'Chief Operating Officer', 'c-level', 350000, 'female', ceo._id),
            createEmployee('Kittisak', 'Charoenpong', 'cmo@company.com', 'MKT', 'Chief Marketing Officer', 'c-level', 320000, 'male', ceo._id),
            createEmployee('Piyanut', 'Jaidee', 'chro@company.com', 'HR', 'Chief Human Resources Officer', 'c-level', 300000, 'female', ceo._id),
        ];
        const cLevelEmployees = await Employee.create(cLevelData);
        allEmployees.push(...cLevelEmployees);

        // Create C-Level lookup
        const cLevel = {};
        cLevelEmployees.forEach(e => {
            const deptCode = Object.keys(deptMap).find(key => deptMap[key].equals(e.department));
            cLevel[deptCode] = e._id;
        });

        // ========================================
        // LEVEL 3: VICE PRESIDENTS
        // ========================================
        const vpData = [
            // Engineering VPs
            createEmployee('Narong', 'Techasirikul', 'vp.engineering@company.com', 'ENG', 'VP of Engineering', 'vp', 200000, 'male', cLevel['ENG']),
            // Finance VPs
            createEmployee('Ratchanee', 'Phongphaew', 'vp.finance@company.com', 'FIN', 'VP of Finance', 'vp', 200000, 'female', cLevel['FIN']),
            // Operations VP
            createEmployee('Somkiat', 'Sritong', 'vp.operations@company.com', 'OPS', 'VP of Operations', 'vp', 190000, 'male', cLevel['OPS']),
            // Marketing VP
            createEmployee('Pornpimol', 'Arunrak', 'vp.marketing@company.com', 'MKT', 'VP of Marketing', 'vp', 180000, 'female', cLevel['MKT']),
            // Sales VP
            createEmployee('Thanakorn', 'Rujikorn', 'vp.sales@company.com', 'SALES', 'VP of Sales', 'vp', 200000, 'male', ceo._id),
            // HR VP
            createEmployee('Oranuch', 'Limthongkul', 'vp.hr@company.com', 'HR', 'VP of Human Resources', 'vp', 170000, 'female', cLevel['HR']),
        ];
        const vpEmployees = await Employee.create(vpData);
        allEmployees.push(...vpEmployees);

        const vps = {};
        vpEmployees.forEach(e => {
            const deptCode = Object.keys(deptMap).find(key => deptMap[key].equals(e.department));
            vps[deptCode] = e._id;
        });

        // ========================================
        // LEVEL 4: ASSISTANT VICE PRESIDENTS
        // ========================================
        const avpData = [
            createEmployee('Chaiwat', 'Buraphawong', 'avp.backend@company.com', 'ENG', 'AVP Backend Development', 'avp', 140000, 'male', vps['ENG']),
            createEmployee('Siriporn', 'Paibul', 'avp.frontend@company.com', 'ENG', 'AVP Frontend Development', 'avp', 140000, 'female', vps['ENG']),
            createEmployee('Mongkol', 'Srithep', 'avp.accounting@company.com', 'FIN', 'AVP Accounting', 'avp', 130000, 'male', vps['FIN']),
            createEmployee('Waraporn', 'Thongchai', 'avp.treasury@company.com', 'FIN', 'AVP Treasury', 'avp', 130000, 'female', vps['FIN']),
            createEmployee('Surasak', 'Jantarat', 'avp.logistics@company.com', 'OPS', 'AVP Logistics', 'avp', 125000, 'male', vps['OPS']),
            createEmployee('Nattaya', 'Pongpat', 'avp.digital@company.com', 'MKT', 'AVP Digital Marketing', 'avp', 120000, 'female', vps['MKT']),
            createEmployee('Praphan', 'Wongsawat', 'avp.sales@company.com', 'SALES', 'AVP Corporate Sales', 'avp', 130000, 'male', vps['SALES']),
            createEmployee('Ratana', 'Songkram', 'avp.recruitment@company.com', 'HR', 'AVP Talent Acquisition', 'avp', 110000, 'female', vps['HR']),
        ];
        const avpEmployees = await Employee.create(avpData);
        allEmployees.push(...avpEmployees);

        const avps = {};
        avpEmployees.forEach(e => {
            if (!avps[e.position]) {
                const deptCode = Object.keys(deptMap).find(key => deptMap[key].equals(e.department));
                if (!avps[deptCode]) avps[deptCode] = [];
                avps[deptCode].push(e._id);
            }
        });

        // ========================================
        // LEVEL 5: MANAGERS
        // ========================================
        const managerData = [
            // Engineering Managers
            createEmployee('Anucha', 'Pattanakit', 'manager.backend1@company.com', 'ENG', 'Backend Team Lead', 'manager', 90000, 'male', avpEmployees[0]._id),
            createEmployee('Benjawan', 'Raksarn', 'manager.frontend1@company.com', 'ENG', 'Frontend Team Lead', 'manager', 90000, 'female', avpEmployees[1]._id),
            createEmployee('Chatchai', 'Wongsri', 'manager.qa@company.com', 'ENG', 'QA Manager', 'manager', 85000, 'male', vps['ENG']),
            createEmployee('Darunee', 'Prempree', 'manager.devops@company.com', 'ENG', 'DevOps Manager', 'manager', 95000, 'female', vps['ENG']),

            // Finance Managers
            createEmployee('Ekachai', 'Srisuwan', 'manager.accounting@company.com', 'FIN', 'Accounting Manager', 'manager', 80000, 'male', avpEmployees[2]._id),
            createEmployee('Fasai', 'Thongdee', 'manager.payroll@company.com', 'FIN', 'Payroll Manager', 'manager', 75000, 'female', avpEmployees[2]._id),

            // HR Managers
            createEmployee('Gorn', 'Srisuk', 'manager.recruitment@company.com', 'HR', 'Recruitment Manager', 'manager', 70000, 'male', avpEmployees[7]._id),
            createEmployee('Hatairat', 'Boonlert', 'manager.training@company.com', 'HR', 'Training Manager', 'manager', 68000, 'female', vps['HR']),

            // Marketing Managers
            createEmployee('Itthipat', 'Wongsa', 'manager.brand@company.com', 'MKT', 'Brand Manager', 'manager', 72000, 'male', avpEmployees[5]._id),
            createEmployee('Jintana', 'Rungroj', 'manager.content@company.com', 'MKT', 'Content Manager', 'manager', 68000, 'female', avpEmployees[5]._id),

            // Sales Managers
            createEmployee('Komsan', 'Thip-osot', 'manager.b2b@company.com', 'SALES', 'B2B Sales Manager', 'manager', 85000, 'male', avpEmployees[6]._id),
            createEmployee('Lalita', 'Prasomsuk', 'manager.b2c@company.com', 'SALES', 'B2C Sales Manager', 'manager', 82000, 'female', avpEmployees[6]._id),

            // Operations Managers
            createEmployee('Manop', 'Saetang', 'manager.warehouse@company.com', 'OPS', 'Warehouse Manager', 'manager', 70000, 'male', avpEmployees[4]._id),
            createEmployee('Nanthida', 'Sangsuk', 'manager.supply@company.com', 'OPS', 'Supply Chain Manager', 'manager', 75000, 'female', avpEmployees[4]._id),

            // IT Support Managers
            createEmployee('Opas', 'Kaewkham', 'manager.helpdesk@company.com', 'IT', 'Help Desk Manager', 'manager', 65000, 'male', vps['ENG']),
            createEmployee('Pranee', 'Thongsuk', 'manager.infrastructure@company.com', 'IT', 'Infrastructure Manager', 'manager', 70000, 'female', vps['ENG']),

            // Legal Manager
            createEmployee('Quanchai', 'Bunyavej', 'manager.legal@company.com', 'LEGAL', 'Legal Counsel', 'manager', 85000, 'male', ceo._id),

            // Customer Service Manager
            createEmployee('Rungnapa', 'Thongprasan', 'manager.cs@company.com', 'CS', 'Customer Service Manager', 'manager', 65000, 'female', vps['OPS']),
        ];
        const managerEmployees = await Employee.create(managerData);
        allEmployees.push(...managerEmployees);

        // ========================================
        // LEVEL 6: ASSISTANT MANAGERS
        // ========================================
        const asstManagerData = [
            // Engineering
            createEmployee('Samart', 'Wongprasert', 'asst.backend@company.com', 'ENG', 'Asst. Backend Team Lead', 'assistant_manager', 65000, 'male', managerEmployees[0]._id),
            createEmployee('Thitima', 'Kongphet', 'asst.frontend@company.com', 'ENG', 'Asst. Frontend Team Lead', 'assistant_manager', 65000, 'female', managerEmployees[1]._id),

            // Finance
            createEmployee('Udom', 'Charoenbun', 'asst.accounting@company.com', 'FIN', 'Asst. Accounting Manager', 'assistant_manager', 55000, 'male', managerEmployees[4]._id),

            // HR
            createEmployee('Vimol', 'Srisawat', 'asst.recruitment@company.com', 'HR', 'Asst. Recruitment Manager', 'assistant_manager', 52000, 'female', managerEmployees[6]._id),

            // Sales
            createEmployee('Wasan', 'Tongprasert', 'asst.b2b@company.com', 'SALES', 'Asst. B2B Sales Manager', 'assistant_manager', 60000, 'male', managerEmployees[10]._id),
            createEmployee('Xanit', 'Saengsuk', 'asst.b2c@company.com', 'SALES', 'Asst. B2C Sales Manager', 'assistant_manager', 58000, 'male', managerEmployees[11]._id),

            // Operations
            createEmployee('Yaowalak', 'Klinhom', 'asst.warehouse@company.com', 'OPS', 'Asst. Warehouse Manager', 'assistant_manager', 50000, 'female', managerEmployees[12]._id),

            // IT
            createEmployee('Ziran', 'Phromket', 'asst.helpdesk@company.com', 'IT', 'Asst. Help Desk Manager', 'assistant_manager', 48000, 'male', managerEmployees[14]._id),

            // Customer Service
            createEmployee('Arisara', 'Phanit', 'asst.cs@company.com', 'CS', 'Asst. Customer Service Manager', 'assistant_manager', 45000, 'female', managerEmployees[17]._id),
        ];
        const asstManagerEmployees = await Employee.create(asstManagerData);
        allEmployees.push(...asstManagerEmployees);

        // ========================================
        // LEVEL 7: SUPERVISORS
        // ========================================
        const supervisorData = [
            // Engineering Supervisors
            createEmployee('Apinya', 'Suksan', 'sup.backend1@company.com', 'ENG', 'Senior Backend Developer (Tech Lead)', 'supervisor', 60000, 'female', asstManagerEmployees[0]._id),
            createEmployee('Duangporn', 'Sittisak', 'sup.frontend1@company.com', 'ENG', 'Senior Frontend Developer (Tech Lead)', 'supervisor', 60000, 'female', asstManagerEmployees[1]._id),
            createEmployee('Grisada', 'Thammawong', 'sup.qa1@company.com', 'ENG', 'QA Lead', 'supervisor', 52000, 'male', managerEmployees[2]._id),

            // Finance Supervisors
            createEmployee('Kamolpan', 'Srithong', 'sup.accounting@company.com', 'FIN', 'Senior Accountant (Supervisor)', 'supervisor', 48000, 'female', asstManagerEmployees[2]._id),

            // Sales Supervisors
            createEmployee('Bannawat', 'Srisuk', 'sup.sales1@company.com', 'SALES', 'Senior Sales Executive (Team Lead)', 'supervisor', 50000, 'male', asstManagerEmployees[4]._id),
            createEmployee('Cholada', 'Meeprom', 'sup.sales2@company.com', 'SALES', 'Senior Sales Executive (Team Lead)', 'supervisor', 50000, 'female', asstManagerEmployees[5]._id),

            // Operations Supervisors
            createEmployee('Hatsada', 'Thongsri', 'sup.warehouse@company.com', 'OPS', 'Warehouse Supervisor', 'supervisor', 38000, 'female', asstManagerEmployees[6]._id),

            // IT Supervisors
            createEmployee('Lertsak', 'Bunyong', 'sup.helpdesk@company.com', 'IT', 'IT Support Supervisor', 'supervisor', 40000, 'male', asstManagerEmployees[7]._id),

            // Customer Service Supervisors
            createEmployee('Sasithorn', 'Meeprom', 'sup.cs1@company.com', 'CS', 'Customer Service Supervisor', 'supervisor', 35000, 'female', asstManagerEmployees[8]._id),

            // HR Supervisors
            createEmployee('Patcharee', 'Somboon', 'sup.recruitment@company.com', 'HR', 'Senior Recruiter (Team Lead)', 'supervisor', 45000, 'female', asstManagerEmployees[3]._id),
        ];
        const supervisorEmployees = await Employee.create(supervisorData);
        allEmployees.push(...supervisorEmployees);

        // ========================================
        // LEVEL 8: OFFICERS (Various Positions)
        // ========================================
        const officerData = [
            // Engineering Officers (Developers) - report to supervisors
            createEmployee('Boonlert', 'Tangsri', 'dev1@company.com', 'ENG', 'Backend Developer', 'officer', 45000, 'male', supervisorEmployees[0]._id),
            createEmployee('Chayanit', 'Wongrat', 'dev2@company.com', 'ENG', 'Junior Backend Developer', 'officer', 35000, 'female', supervisorEmployees[0]._id),
            createEmployee('Prateep', 'Jaidee', 'dev3@company.com', 'ENG', 'Backend Developer', 'officer', 45000, 'male', supervisorEmployees[0]._id),
            createEmployee('Eakarin', 'Poolsawat', 'dev4@company.com', 'ENG', 'Frontend Developer', 'officer', 45000, 'male', supervisorEmployees[1]._id),
            createEmployee('Fongchan', 'Wisetphan', 'dev5@company.com', 'ENG', 'Junior Frontend Developer', 'officer', 35000, 'female', supervisorEmployees[1]._id),
            createEmployee('Weerasak', 'Thongprasert', 'dev6@company.com', 'ENG', 'Frontend Developer', 'officer', 45000, 'male', supervisorEmployees[1]._id),
            createEmployee('Hathaiwan', 'Phongsri', 'qa1@company.com', 'ENG', 'QA Engineer', 'officer', 38000, 'female', supervisorEmployees[2]._id),
            createEmployee('Parichat', 'Bunsri', 'qa2@company.com', 'ENG', 'QA Engineer', 'officer', 38000, 'female', supervisorEmployees[2]._id),
            createEmployee('Itsarapong', 'Meesuk', 'devops1@company.com', 'ENG', 'DevOps Engineer', 'officer', 50000, 'male', managerEmployees[3]._id),
            createEmployee('Jariya', 'Chokdee', 'devops2@company.com', 'ENG', 'Cloud Engineer', 'officer', 52000, 'female', managerEmployees[3]._id),

            // Finance Officers - report to supervisors
            createEmployee('Lerkpong', 'Thipsri', 'accountant1@company.com', 'FIN', 'Accountant', 'officer', 35000, 'male', supervisorEmployees[3]._id),
            createEmployee('Malee', 'Boonterm', 'accountant2@company.com', 'FIN', 'Junior Accountant', 'officer', 28000, 'female', supervisorEmployees[3]._id),
            createEmployee('Thanapol', 'Srisuk', 'accountant3@company.com', 'FIN', 'Accountant', 'officer', 35000, 'male', supervisorEmployees[3]._id),
            createEmployee('Niran', 'Khaewkerd', 'payroll1@company.com', 'FIN', 'Payroll Specialist', 'officer', 38000, 'male', managerEmployees[5]._id),
            createEmployee('Orathai', 'Boonrak', 'payroll2@company.com', 'FIN', 'Payroll Officer', 'officer', 32000, 'female', managerEmployees[5]._id),

            // HR Officers - report to supervisors
            createEmployee('Ronnakorn', 'Wichian', 'recruiter1@company.com', 'HR', 'Recruiter', 'officer', 32000, 'male', supervisorEmployees[9]._id),
            createEmployee('Sumalee', 'Thonglor', 'hr.admin@company.com', 'HR', 'HR Administrator', 'officer', 28000, 'female', supervisorEmployees[9]._id),
            createEmployee('Tanaporn', 'Jitprasert', 'trainer1@company.com', 'HR', 'Training Specialist', 'officer', 35000, 'female', managerEmployees[7]._id),

            // Marketing Officers
            createEmployee('Unchalee', 'Ruangroj', 'designer1@company.com', 'MKT', 'Senior Graphic Designer', 'officer', 42000, 'female', managerEmployees[8]._id),
            createEmployee('Visanu', 'Pengsri', 'designer2@company.com', 'MKT', 'UI/UX Designer', 'officer', 45000, 'male', managerEmployees[8]._id),
            createEmployee('Wanchana', 'Boonpeng', 'content1@company.com', 'MKT', 'Content Writer', 'officer', 32000, 'female', managerEmployees[9]._id),
            createEmployee('Yingyot', 'Thongperm', 'social1@company.com', 'MKT', 'Social Media Specialist', 'officer', 30000, 'male', managerEmployees[9]._id),
            createEmployee('Amonrat', 'Chaidet', 'seo1@company.com', 'MKT', 'SEO Specialist', 'officer', 35000, 'female', avpEmployees[5]._id),

            // Sales Officers - report to supervisors
            createEmployee('Danuphon', 'Thongkerd', 'sales1@company.com', 'SALES', 'Sales Executive', 'officer', 35000, 'male', supervisorEmployees[4]._id),
            createEmployee('Natthawut', 'Boonmee', 'sales2@company.com', 'SALES', 'Sales Executive', 'officer', 35000, 'male', supervisorEmployees[4]._id),
            createEmployee('Phakamas', 'Rungroj', 'sales3@company.com', 'SALES', 'Sales Representative', 'officer', 28000, 'female', supervisorEmployees[4]._id),
            createEmployee('Ekawit', 'Poolsup', 'sales4@company.com', 'SALES', 'Sales Representative', 'officer', 28000, 'male', supervisorEmployees[5]._id),
            createEmployee('Fonthip', 'Rungroj', 'sales5@company.com', 'SALES', 'Sales Representative', 'officer', 28000, 'female', supervisorEmployees[5]._id),
            createEmployee('Gunthee', 'Saephan', 'sales6@company.com', 'SALES', 'Sales Representative', 'officer', 28000, 'male', supervisorEmployees[5]._id),

            // Operations Officers - report to supervisors
            createEmployee('Intira', 'Boonterm', 'warehouse1@company.com', 'OPS', 'Warehouse Staff', 'officer', 22000, 'female', supervisorEmployees[6]._id),
            createEmployee('Jirawat', 'Srisuk', 'warehouse2@company.com', 'OPS', 'Warehouse Staff', 'officer', 22000, 'male', supervisorEmployees[6]._id),
            createEmployee('Jirat', 'Wongprasert', 'logistics1@company.com', 'OPS', 'Logistics Coordinator', 'officer', 30000, 'male', managerEmployees[13]._id),
            createEmployee('Kamonrat', 'Srisuk', 'supply1@company.com', 'OPS', 'Supply Chain Analyst', 'officer', 35000, 'female', managerEmployees[13]._id),

            // IT Support Officers - report to supervisors
            createEmployee('Monthira', 'Thongperm', 'helpdesk1@company.com', 'IT', 'IT Support Technician', 'officer', 25000, 'female', supervisorEmployees[7]._id),
            createEmployee('Somchai', 'Ruangrit', 'helpdesk2@company.com', 'IT', 'IT Support Technician', 'officer', 25000, 'male', supervisorEmployees[7]._id),
            createEmployee('Nopparat', 'Sangsri', 'sysadmin1@company.com', 'IT', 'System Administrator', 'officer', 42000, 'male', managerEmployees[15]._id),
            createEmployee('Ornpapha', 'Chalermpol', 'network1@company.com', 'IT', 'Network Engineer', 'officer', 40000, 'female', managerEmployees[15]._id),

            // Legal Officers
            createEmployee('Pongsakorn', 'Ruangrit', 'legal1@company.com', 'LEGAL', 'Legal Officer', 'officer', 45000, 'male', managerEmployees[16]._id),
            createEmployee('Rungrat', 'Sombat', 'legal2@company.com', 'LEGAL', 'Compliance Officer', 'officer', 40000, 'female', managerEmployees[16]._id),

            // Customer Service Officers - report to supervisors
            createEmployee('Tawatchai', 'Wongsri', 'cs1@company.com', 'CS', 'Customer Service Rep', 'officer', 25000, 'male', supervisorEmployees[8]._id),
            createEmployee('Usanee', 'Thonglor', 'cs2@company.com', 'CS', 'Customer Service Rep', 'officer', 25000, 'female', supervisorEmployees[8]._id),
            createEmployee('Varunee', 'Srisawat', 'cs3@company.com', 'CS', 'Customer Service Rep', 'officer', 25000, 'female', supervisorEmployees[8]._id),
            createEmployee('Warin', 'Thaweesuk', 'cs4@company.com', 'CS', 'Customer Service Rep', 'officer', 25000, 'male', supervisorEmployees[8]._id),
        ];
        const officerEmployees = await Employee.create(officerData);
        allEmployees.push(...officerEmployees);

        // ========================================
        // UPDATE DEPARTMENT MANAGERS
        // ========================================
        console.log('🔗 Updating department managers...');
        await Department.findByIdAndUpdate(deptMap['EXEC'], { manager: ceo._id });
        await Department.findByIdAndUpdate(deptMap['ENG'], { manager: cLevelEmployees[0]._id });
        await Department.findByIdAndUpdate(deptMap['FIN'], { manager: cLevelEmployees[1]._id });
        await Department.findByIdAndUpdate(deptMap['OPS'], { manager: cLevelEmployees[2]._id });
        await Department.findByIdAndUpdate(deptMap['MKT'], { manager: cLevelEmployees[3]._id });
        await Department.findByIdAndUpdate(deptMap['HR'], { manager: cLevelEmployees[4]._id });
        await Department.findByIdAndUpdate(deptMap['SALES'], { manager: vpEmployees[4]._id });
        await Department.findByIdAndUpdate(deptMap['IT'], { manager: managerEmployees[14]._id });
        await Department.findByIdAndUpdate(deptMap['LEGAL'], { manager: managerEmployees[16]._id });
        await Department.findByIdAndUpdate(deptMap['CS'], { manager: managerEmployees[17]._id });

        // ========================================
        // CREATE USER ACCOUNTS
        // ========================================
        console.log('👤 Creating user accounts...');

        // Create superadmin user (system administrator - not linked to employee)
        await User.create({
            email: 'superadmin@company.com',
            password: 'password123',
            tempPassword: 'password123',
            role: 'superadmin',
            isActive: true
        });

        // Create admin user (linked to CEO)
        await User.create({
            email: 'admin@company.com',
            password: 'password123',
            tempPassword: 'password123',
            role: 'admin',
            employee: ceo._id,
            isActive: true
        });

        // Create HR user (linked to HR Manager)
        await User.create({
            email: 'hr@company.com',
            password: 'password123',
            tempPassword: 'password123',
            role: 'hr',
            employee: managerEmployees[6]._id,
            isActive: true
        });

        // Create sample employee user
        await User.create({
            email: 'dev1@company.com',
            password: 'password123',
            tempPassword: 'password123',
            role: 'employee',
            employee: officerEmployees[0]._id,
            isActive: true
        });

        // Create manager user (uses 'employee' role as User model doesn't have 'manager')
        await User.create({
            email: 'manager.backend1@company.com',
            password: 'password123',
            tempPassword: 'password123',
            role: 'employee',
            employee: managerEmployees[0]._id,
            isActive: true
        });

        // ========================================
        // SUMMARY
        // ========================================
        console.log('');
        console.log('✅ Database seeded successfully!');
        console.log('');
        console.log('📊 Summary:');
        console.log('─────────────────────────────────────────');
        console.log(`   Departments created: ${departments.length}`);
        console.log(`   Employees created: ${allEmployees.length}`);
        console.log('');
        console.log('   By Level:');
        console.log(`     • CEO: 1`);
        console.log(`     • C-Level: ${cLevelEmployees.length}`);
        console.log(`     • VP: ${vpEmployees.length}`);
        console.log(`     • AVP: ${avpEmployees.length}`);
        console.log(`     • Manager: ${managerEmployees.length}`);
        console.log(`     • Assistant Manager: ${asstManagerEmployees.length}`);
        console.log(`     • Supervisor: ${supervisorEmployees.length}`);
        console.log(`     • Officer: ${officerEmployees.length}`);
        console.log('');
        console.log('📋 Test Accounts:');
        console.log('─────────────────────────────────────────');
        console.log('SuperAdmin: superadmin@company.com / password123');
        console.log('Admin:      admin@company.com / password123');
        console.log('HR:         hr@company.com / password123');
        console.log('Manager:    manager.backend1@company.com / password123');
        console.log('Employee:   dev1@company.com / password123');
        console.log('─────────────────────────────────────────');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
};

seedDatabase();
