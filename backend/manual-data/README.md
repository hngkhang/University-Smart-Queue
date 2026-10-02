# Bộ dữ liệu đúng phạm vi FAE — MongoDB Atlas

Bộ này thay thế hoàn toàn các file `01-...`, `02-users.json`, `03-...`, `04-...` được soạn trước đó. Không chạy bản cũ nếu bạn đã copy ra nơi khác.

Nguồn phạm vi: `F:/University/New tech/NEWTECH_PROJECT_CONTEXT.md`, mục 2–3. Tên 5 văn phòng và địa điểm theo tài liệu của bạn. Danh mục dịch vụ chi tiết, thời lượng và giờ làm việc bên dưới là **dữ liệu đề xuất để demo**, chưa được xác nhận với nhà trường. Medical Station chỉ minh họa lịch tiếp nhận thông thường.

## 1. Có gì trong bộ mới?

| Văn phòng | Địa điểm | Thay đổi |
| --- | --- | --- |
| Faculty of Advanced Education | F1-309 | Thêm mới |
| Academic Affairs Office | A1-201 / A1-202 | Chuẩn hóa Registrar Office, giữ nguyên ID |
| Student Affairs Office | A1-203 / A1-204 | Thêm mới |
| Finance & Accounting Office | A1-102 | Chuẩn hóa Finance Office, giữ nguyên ID |
| Medical Station | Khu B | Thêm mới |

Library Services được giữ lại với `isArchived: true`, `isActive: false`, `bookingEnabled: false`; hàng đợi Library đóng. API danh sách bỏ qua văn phòng đã lưu trữ. API tra cứu theo ID và lịch sử cũ vẫn giữ liên kết.

Mỗi văn phòng trong phạm vi có một hàng đợi chung cho tất cả dịch vụ. Queue đã tồn tại giữ nguyên trạng thái mở/tạm dừng và các trường khác; queue mới mở để demo. Bộ đếm số vé không bị đặt lại.

### 20 dịch vụ đề xuất

| Văn phòng | Service | Phút |
| --- | --- | ---: |
| FAE | Program Consultation | 15 |
| FAE | Course Registration Guidance | 10 |
| FAE | Internship Document Support | 10 |
| FAE | Graduation Requirement Consultation | 15 |
| Academic Affairs | Transcript Request | 10 |
| Academic Affairs | Student Confirmation | 10 |
| Academic Affairs | Information Correction | 15 |
| Academic Affairs | Course-related Support | 15 |
| Student Affairs | Scholarship Consultation | 15 |
| Student Affairs | Student Policy Support | 15 |
| Student Affairs | Student Profile Update | 10 |
| Student Affairs | Student Activity Confirmation | 10 |
| Finance & Accounting | Tuition Fee Inquiry | 10 |
| Finance & Accounting | Tuition Payment Confirmation | 10 |
| Finance & Accounting | Financial Clearance | 9 |
| Finance & Accounting | Billing Correction | 15 |
| Medical Station | Health Consultation | 15 |
| Medical Station | Health Insurance Guidance | 10 |
| Medical Station | Medical Document Support | 10 |
| Medical Station | Health Check Guidance | 15 |

Finance chỉ hỗ trợ thông tin và xác nhận hồ sơ; ứng dụng không thu tiền trực tuyến. Dịch vụ Scholarship được đặt trong Student Affairs trong bộ đề xuất này.

Giờ đề xuất: **07:30–11:30 | 13:00–16:30, thứ Hai đến thứ Sáu**, chưa cấu hình ngày nghỉ riêng. Script chỉ điền lịch và trạng thái hoạt động khi trường chưa tồn tại; giữ cấu hình đã có. File `departments.json` chứa toàn bộ nội dung để bạn xem/sửa trước khi chạy.

### Tài khoản

Giữ 4 tài khoản hiện có và mật khẩu của chúng:

- `admin@campus.edu`
- `registrar.staff@campus.edu` → Academic Affairs, email giữ nguyên
- `finance.staff@campus.edu` → Finance & Accounting, email giữ nguyên
- `student@campus.edu`

Thêm 8 tài khoản demo:

| Email | Role | Văn phòng / MSSV demo |
| --- | --- | --- |
| `fae.staff@example.com` | staff | FAE |
| `studentaffairs.staff@example.com` | staff | Student Affairs |
| `medical.staff@example.com` | staff | Medical Station |
| `fae.student1@example.com` | student | FAE-DEMO-001 |
| `fae.student2@example.com` | student | FAE-DEMO-002 |
| `fae.student3@example.com` | student | FAE-DEMO-003 |
| `fae.student4@example.com` | student | FAE-DEMO-004 |
| `fae.student5@example.com` | student | FAE-DEMO-005 |

Mật khẩu của **8 tài khoản mới**: **`DemoQueue@123`**. `users.json` chứa bcrypt hash. Đây là danh tính thử nghiệm; tiền tố MSSV FAE chỉ là nhãn demo, chưa phải cơ chế xác minh sinh viên thuộc FAE.

Không tạo thêm admin, yêu cầu quên mật khẩu, vé hay lịch hẹn giả. Bạn có thể tạo vé và lịch hẹn qua giao diện để kiểm tra luồng thật. Vé đã hủy, tên phòng/dịch vụ chụp lại trong lịch sử và các lịch hẹn cũ được giữ nguyên.

## 2. Đưa dữ liệu lên MongoDB Atlas

### Bước 1 — Mở terminal tại thư mục dự án

```powershell
cd backend
```

Nếu terminal đã ở `backend`, bỏ qua lệnh này. Nếu đang dùng terminal đó để chạy backend, nhấn Ctrl+C hoặc mở terminal khác. Trong lúc chạy cập nhật, nên ngừng thao tác trên ứng dụng.

### Bước 2 — Kiểm tra kết nối đã có

Script đọc **`backend/.env`**, cùng biến **`MONGODB_URI`** mà backend sử dụng. Kết nối này đã được kiểm tra đang trỏ đến Atlas, database **`queue-management`**. Bạn không cần tạo database mới, cài mongosh hay import từng collection.

Script không hiển thị chuỗi kết nối/mật khẩu. Nó sẽ dừng nếu URI chọn database khác. Nếu bạn chuyển cluster, kiểm tra cluster trong URI trước khi chạy; kiểm tra tên database không phân biệt hai cluster cùng có database `queue-management`.

### Bước 3 — Xem trước, chưa ghi

```powershell
node manual-data/update-project-data.js --dry-run
```

Lệnh liệt kê từng văn phòng được thêm/chuẩn hóa, các tài khoản mới và Library được lưu trữ. Chạy không có tham số cũng chỉ xem trước. Chế độ này không tạo index, backup hay ghi document.

### Bước 4 — Ghi lên Atlas

Khi nội dung xem trước đúng bộ dữ liệu bạn muốn, tự chạy:

```powershell
node manual-data/update-project-data.js --apply
```

**Đây là lệnh ghi trực tiếp vào database Atlas trong URI.** Không cần upload thêm file trên web.

Script sẽ:

1. Kiểm tra ID, email, liên kết staff và số hàng đợi.
2. Sao lưu dữ liệu 6 collection vào `backend/manual-data/backups/`.
3. Thực hiện các thay đổi trong transaction MongoDB.
4. Báo thành công và đường dẫn backup sau khi commit.

Nếu ID/email xung đột, Library đã có staff hoặc đang có lượt phục vụ/lịch hẹn chưa kết thúc, script dừng để đối chiếu. Script không tự xóa những liên kết đó. Nếu MongoDB không hỗ trợ transaction, lệnh không chuyển sang ghi từng phần.

Backup có dữ liệu tài khoản và password hash; thư mục này đã được bỏ qua trong Git. Lưu bản backup để có thể đối chiếu/khôi phục khi cần. File backup là Extended JSON theo từng collection, không phải file để import toàn bộ vào một collection duy nhất.

Chạy lại không nhân đôi document hay reset mật khẩu, nhưng **sẽ áp dụng lại tên, mô tả, địa điểm và danh sách dịch vụ trong `departments.json`**. Đây là cập nhật danh mục có chủ đích; không đặt lệnh này vào quá trình khởi động server.

### Bước 5 — Xem trên web MongoDB

Vào MongoDB Atlas → đúng Project/Cluster → **Data Explorer / Browse Collections** → **queue-management** → Refresh.

Với trạng thái trước cập nhật đã kiểm tra, dự kiến:

| Collection | Sau cập nhật |
| --- | ---: |
| departments | 6: 5 văn phòng trong phạm vi + Library lưu trữ |
| users | 12: 1 admin + 5 staff + 6 student |
| queues | 6: 5 hàng đợi trong phạm vi + Library đóng |
| queue_tickets | Giữ số hiện có: 1 vé đã hủy |
| queue_sequences | Giữ số hiện có: 1 |
| appointments | Giữ số hiện có: 0 |

Các số này có thể tăng nếu bạn đã tự tạo dữ liệu khác. Trong collection `departments`, dùng bộ lọc sau để xem 5 văn phòng đang trong danh mục:

```json
{ "isArchived": { "$ne": true } }
```

### Bước 6 — Xem trên ứng dụng

```powershell
npm run dev
```

Refresh trang chủ. Backend đã được bổ sung hỗ trợ `location.label` để hiển thị số phòng và bỏ văn phòng đã lưu trữ khỏi danh sách. Với website đã deploy, cần triển khai cả thay đổi backend này; việc dữ liệu trên Atlas đổi không tự cập nhật code trên host.

Đăng nhập `fae.student1@example.com` / `DemoQueue@123`, chọn một trong 5 văn phòng, chọn service và lấy số. Vé thật sẽ xuất hiện trong `queue_tickets`; lấy số cũng cập nhật `queue_sequences`. Đặt lịch qua giao diện sẽ tạo `appointments` và tính đúng các phút giữ chỗ.

StaffWorkspace vẫn là demo cho thao tác gọi/phục vụ; bộ dữ liệu này chưa bổ sung API staff, ETA hay realtime.

## 3. File nào dùng để làm gì?

| File | Mục đích |
| --- | --- |
| `departments.json` | Nội dung 5 văn phòng và 20 dịch vụ; có thể chỉnh trước khi chạy |
| `users.json` | 8 tài khoản demo mới, mật khẩu đã hash |
| `update-project-data.js` | Kiểm tra, xem trước, backup và cập nhật database hiện có |

**Không import trực tiếp `departments.json` vào collection cũ**: Academic Affairs và Finance giữ ID cũ nên thao tác insert sẽ trùng ID. Dùng script để cập nhật đúng các document đó và tạo những phần còn thiếu.

## Nguồn

- Phạm vi/địa điểm: tài liệu `NEWTECH_PROJECT_CONTEXT.md` của dự án.
- [MongoDB Atlas Data Explorer](https://www.mongodb.com/docs/atlas/atlas-ui/collections/)
- [Kết nối MongoDB từ Node.js](https://www.mongodb.com/docs/drivers/node/current/connect/)
