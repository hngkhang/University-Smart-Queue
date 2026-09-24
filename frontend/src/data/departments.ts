import type { Department } from "../types";

export const departments: Department[] = [
  {
    id: "academic-affairs",
    name: "Academic Affairs",
    vietnameseName: "Phòng Đào tạo",
    description:
      "Support for course registration, academic records, examinations and graduation.",
    status: "open",
    waitingCount: 12,
    estimatedWait: 30,
    activeCounters: 2,
    services: [
      "Course Registration Support",
      "Transcript Request",
      "Graduation Consultation",
      "Exam & Grade Support",
    ],
    location: "HCMUTE Campus",
    workingHours: "07:30 - 11:30 | 13:00 - 16:30",
  },
  {
    id: "student-affairs",
    name: "Student Affairs",
    vietnameseName: "Phòng Công tác Sinh viên",
    description:
      "Support for student certificates, scholarships, policies and student records.",
    status: "open",
    waitingCount: 6,
    estimatedWait: 15,
    activeCounters: 2,
    services: [
      "Student Certificate",
      "Scholarship Support",
      "Student Profile Support",
      "Conduct Score Support",
    ],
    location: "HCMUTE Campus",
    workingHours: "07:30 - 11:30 | 13:00 - 16:30",
  },
  {
    id: "finance",
    name: "Finance Office",
    vietnameseName: "Phòng Kế hoạch - Tài chính",
    description:
      "Support for tuition fees, payment confirmation and financial inquiries.",
    status: "open",
    waitingCount: 9,
    estimatedWait: 25,
    activeCounters: 1,
    services: [
      "Tuition Inquiry",
      "Tuition Payment Confirmation",
      "Incorrect Tuition Support",
      "Student Payment Support",
    ],
    location: "HCMUTE Campus",
    workingHours: "07:30 - 11:30 | 13:00 - 16:30",
  },
  {
    id: "it-support",
    name: "IT Support",
    vietnameseName: "Trung tâm Thông tin - Máy tính",
    description:
      "Support for student accounts, email, online systems and campus IT services.",
    status: "closed",
    waitingCount: 0,
    estimatedWait: 0,
    activeCounters: 0,
    services: [
      "Student Email Support",
      "Account Password Reset",
      "Online Portal Support",
      "Student Account Activation",
    ],
    location: "HCMUTE Campus",
    workingHours: "07:30 - 11:30 | 13:00 - 16:30",
  },
];