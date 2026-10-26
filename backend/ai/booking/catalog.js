// Descriptions supplement existing live services; they never add services to the catalog.
// A department's configured description takes precedence for custom service definitions.
const descriptions = {
  "Program Consultation": "Tư vấn chương trình học, lộ trình và chuyên ngành.",
  "Course Registration Guidance": "Hướng dẫn thao tác và quy trình đăng ký học phần.",
  "Internship Document Support": "Hỗ trợ giấy tờ, hồ sơ thực tập.",
  "Graduation Requirement Consultation": "Tư vấn điều kiện và yêu cầu tốt nghiệp.",
  "Transcript Request": "Xin cấp bảng điểm, kết quả học tập.",
  "Student Confirmation": "Xin giấy xác nhận đang là sinh viên; không phải xác nhận tham gia hoạt động.",
  "Information Correction": "Điều chỉnh thông tin trong hồ sơ học vụ; không sửa hóa đơn hay hồ sơ hoạt động sinh viên.",
  "Course-related Support": "Giải quyết vấn đề học vụ liên quan môn học, học phần.",
  "Scholarship Consultation": "Tư vấn điều kiện, hồ sơ học bổng.",
  "Student Policy Support": "Hỗ trợ chế độ, chính sách và quyền lợi sinh viên.",
  "Student Profile Update": "Cập nhật hồ sơ công tác sinh viên; cần làm rõ loại hồ sơ khi chỉ nói sửa thông tin.",
  "Student Activity Confirmation": "Xác nhận tham gia hoạt động sinh viên; không phải giấy xác nhận đang theo học.",
  "Tuition Fee Inquiry": "Tra cứu, hỏi số tiền hoặc thông tin học phí; không xác nhận đã thanh toán.",
  "Tuition Payment Confirmation": "Xác nhận khoản học phí đã thanh toán, đã nộp hoặc chuyển khoản.",
  "Financial Clearance": "Xác nhận hoàn tất nghĩa vụ tài chính, tình trạng công nợ.",
  "Billing Correction": "Điều chỉnh sai sót hóa đơn, thông tin tính phí.",
  "Health Consultation": "Đặt hẹn tư vấn sức khỏe thông thường.",
  "Health Insurance Guidance": "Hướng dẫn thủ tục và hồ sơ bảo hiểm y tế.",
  "Medical Document Support": "Hỗ trợ giấy tờ, hồ sơ y tế.",
  "Health Check Guidance": "Hướng dẫn quy trình, thủ tục khám sức khỏe.",
};

function publicCatalog(catalog) {
  return catalog.map(item => ({
    departmentId: String(item._id), name: item.name,
    vietnameseName: item.vietnameseName || "", description: item.description || "",
    services: item.services.map(service => ({ name: service.name,
      description: service.description || (Object.hasOwn(descriptions, service.name) ? descriptions[service.name] : ""),
    })),
  }));
}

module.exports = { publicCatalog };
