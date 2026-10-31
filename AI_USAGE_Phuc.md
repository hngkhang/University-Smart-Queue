
## 1. Tôi đã dùng AI như thế nào?

Trong quá trình làm dự án, tôi dùng Codex để bổ sung chức năng, tìm lỗi, viết test và hướng dẫn deploy. Tôi đưa yêu cầu, chạy thử một số luồng rồi gửi lại lỗi hoặc những điểm chưa đúng để sửa tiếp. Tôi cũng dùng Codex để giải thích code và hỗ trợ viết báo cáo.

Nội dung dưới đây được tổng hợp từ lịch sử chat của dự án. Các prompt là lời nhắn thật hoặc đoạn trích từ lời nhắn của tôi. Những kết quả test được nhắc đến là kết quả Codex báo ở thời điểm làm chức năng, không phải một lần chạy lại toàn bộ dự án.

## 2. Các phần có sử dụng Codex

### Theo dõi trạng thái vé và thao tác của nhân viên

**Prompt:** “Thực hiện cho tôi tính năng Theo dõi đầy đủ trạng thái vé : Hiển thị đang chờ → được gọi → đang phục vụ → hoàn thành; xử lý cả hủy và vắng mặt.”

Codex bổ sung API cho nhân viên gọi số, bắt đầu phục vụ, hoàn tất, hủy và đánh dấu vắng mặt. Các thao tác được nối vào màn hình nhân viên và My Queue có sẵn.

Tôi yêu cầu giải thích các file đã sửa và chọn chỉ hiển thị phòng ban, chưa cần thêm quầy phục vụ. Khi tải code từ GitHub về, tôi gặp lỗi thiếu `staffRoutes.js` và gửi log. Codex phát hiện các file chức năng chưa được đưa đủ vào commit, rồi hướng dẫn tôi kiểm tra và bổ sung.

**File tiêu biểu:** `backend/routes/staffRoutes.js`, `backend/models/QueueTicket.js`, `frontend/src/pages/StaffWorkspace.tsx`, `frontend/src/pages/MyQueuePage.tsx`.

### Sửa lỗi đặt lịch và đưa lịch hẹn vào hàng chờ

**Prompt:** “thực hiện cho tôi tính năng: xử lí appointment khi đến thời gian sẽ nhảy vào queue đợi (có thể hiển thị trước 5p chẳng hạn), xử lí appointment giống như xử lí ticket”.

Tôi gặp tình trạng staff không thấy lịch hẹn đã đặt nên yêu cầu nối lịch hẹn với hàng chờ. Codex thêm xử lý tạo vé trước giờ hẹn 5 phút để staff phục vụ giống vé thường.

Tôi hỏi lại cách xếp thứ tự giữa lịch hẹn và vé lấy trực tiếp. Để thử tính năng, tôi yêu cầu tạm mở giờ đặt lịch đến 23:00 trên máy local, sau đó trả về giờ bình thường. Trong cùng cuộc chat, tôi còn báo lỗi đặt lịch bị báo trùng dù giờ vẫn trống và chọn phương án sửa cả index database lẫn thông báo lỗi.

**File tiêu biểu:** `backend/lib/appointmentQueue.js`, `backend/lib/appointmentIndexes.js`, `backend/routes/appointmentRoutes.js`, `frontend/src/pages/AppointmentsPage.tsx`.

### Thông báo no-show và hủy vé cuối ngày

**Prompt:** “thực hiện cho tôi tính năng hiển thị thông báo vé no-show(ngay trên vé appointment), và hết ngày thì hủy vé”.

Codex thêm thông báo trên lịch hẹn khi sinh viên bị đánh dấu vắng mặt và xử lý hủy vé còn chờ khi hết ngày.

Trước khi làm, tôi hỏi có cần thêm xử lý đến trễ khi staff đã có nút Mark no-show hay không. Sau đó, tôi chọn giữ việc đánh dấu vắng mặt cho staff và bổ sung thông báo cho sinh viên. Vé đang được phục vụ vẫn được tiếp tục; nghỉ trưa không làm vé bị hủy.

**File tiêu biểu:** `backend/lib/ticketExpiry.js`, `backend/tests/ticketExpiry.test.js`, `frontend/src/pages/AppointmentsPage.tsx`.

### Quản lý phòng ban

**Prompt:** “duyệt qua dự án của tôi và thực hiện cho tôi tính năng thêm xóa sửa phòng ban cho admin”.

Codex viết API và giao diện quản lý phòng ban, dịch vụ, giờ làm việc. Tôi hỏi rõ thao tác Delete là xóa thật hay soft-delete để hiểu cách giữ lịch sử dữ liệu.

Khi test chưa chạy được, tôi kết nối lại MongoDB Compass và yêu cầu chạy lại. Qua đó, Codex phát hiện và sửa lỗi trong phần thiết lập test. Tôi cũng yêu cầu script tạo tài khoản admin để sử dụng chức năng.

**File tiêu biểu:** `backend/routes/adminDepartmentRoutes.js`, `backend/tests/adminDepartments.test.js`, `frontend/src/pages/AdminDepartments.tsx`.

### Quản lý người dùng

**Prompt:** “Thực hiện tiếp cho tôi tính năng quản lí người dùng của admin”.

Codex bổ sung tạo và sửa tài khoản student/staff, phân công phòng ban, khóa/mở khóa tài khoản, tìm kiếm và lọc danh sách.

Tôi yêu cầu làm tiếp trên trang admin hiện có. Codex báo đã kiểm tra build, lint, 23 test quản trị và thử giao diện bằng dữ liệu mẫu, kèm ảnh kết quả. Phần kiểm tra này do Codex thực hiện.

**File tiêu biểu:** `backend/routes/adminUserRoutes.js`, `backend/tests/adminUsers.test.js`, `frontend/src/pages/AdminUserForm.tsx`.

### Đăng nhập Google và phân quyền

**Prompt:** “thực hiện cho tôi tính năng OAuth2(google) + JWT + phân quyền”. Tôi bổ sung: “đăng nhập bằng OAuth2 google chỉ cho role student”.

Codex thêm đăng nhập Google, JWT, nút đăng nhập và trang callback. Bản đầu hiểu sai yêu cầu, bắt tài khoản student phải tồn tại trước. Tôi thử đăng nhập, gửi ảnh lỗi và yêu cầu sửa để tài khoản Google mới được tạo với role student.

Sau khi lấy code mới, tôi còn báo lỗi không thấy nút Google dù đã có các file OAuth. Codex kiểm tra và nối lại các phần còn thiếu trong giao diện, route và model. Tôi cũng gửi lỗi khi chạy trên máy khác để kiểm tra cấu hình `localhost`, `127.0.0.1` và callback.

**File tiêu biểu:** `backend/lib/googleOAuth.js`, `backend/routes/googleAuthRoutes.js`, `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/GoogleCallbackPage.tsx`.

### Cập nhật hàng chờ bằng WebSocket

**Prompt:** “Hiện dùng polling mỗi 5 giây. Cần WebSocket, SSE hoặc giải pháp được đề chấp nhận. Khi staff gọi số, màn hình sinh viên cần nhận cập nhật từ server. Sử dụng websocket để thực hiện tính năng realtime này cho tôi”.

Tôi yêu cầu thay cơ chế tải lại mỗi 5 giây bằng WebSocket. Codex dùng Socket.IO để gửi cập nhật khi staff thao tác, đồng thời xử lý xác thực và kết nối lại khi mất mạng.

Codex báo 52 test backend, 4 test frontend, build và lint đều đạt trong lần triển khai này.

**File tiêu biểu:** `backend/lib/queueRealtime.js`, `backend/lib/queueEvents.js`, `frontend/src/services/queueRealtime.ts`.

### Streaming cho chatbot

**Prompt:** “Thực hiện cho tôi tính năng AI Streaming cho chatbot hiện tại của tôi”.

Sau khi hỏi về tính năng frontend hiện đại, tôi chọn streaming để câu trả lời AI hiện dần. Codex thêm API streaming và phần đọc dữ liệu trên giao diện, có xử lý khi luồng trả lời bị lỗi.

Trước đó, tôi không thấy chatbot trên web nên nhờ kiểm tra. Codex xác định chatbot nằm ở nhánh `main`, còn tôi đang chạy `Phuc`, rồi hướng dẫn merge và cài dependency còn thiếu. Khi bàn giao streaming, Codex báo 12 test liên quan cùng build/lint đạt, nhưng chưa thử câu hỏi Gemini thật bằng tài khoản của tôi.

**File tiêu biểu:** `backend/routes/aiRoutes.js`, `backend/ai/providers/geminiClient.js`, `frontend/src/services/ai.ts`, `frontend/src/features/ai/hooks/useAssistant.ts`.

### Upload tài liệu Markdown cho AI

**Prompt:** “Thực hiện cho tôi việc upload file này, chỉ cho phép upload file .md”. Tôi cũng yêu cầu thay nội dung file cũ nhưng giữ nguyên tên trong source.

Codex thêm trang upload cho admin, kiểm tra định dạng và dung lượng, rồi nạp lại tài liệu vào RAG. Nếu xử lý thất bại thì giữ lại tài liệu cũ.

Tôi thử upload file hướng dẫn thật và gửi lỗi nhận được. Codex kiểm tra thấy Chroma chưa chạy, khởi động lại và nạp thành công 73 đoạn của tài liệu phiên bản 1.1. Sau đó, thông báo lỗi được sửa để dễ phân biệt lỗi Chroma với Gemini.

**File tiêu biểu:** `backend/ai/knowledgeUpload.js`, `backend/routes/adminKnowledgeRoutes.js`, `frontend/src/pages/AdminKnowledge.tsx`.


## 3. Những lần kết quả AI bị sai hoặc chưa tốt

### Lỗi 1: Hiểu sai yêu cầu đăng nhập Google

Tôi muốn người dùng đăng nhập Google lần đầu được tạo tài khoản student. Tuy nhiên, code Codex viết ban đầu chỉ cho đăng nhập nếu tài khoản đã tồn tại.

Tôi phát hiện khi thử chức năng và gửi phản hồi: “Tại sao lại bị lỗi này, tôi yêu cầu đăng nhập bằng gg luôn set role là student mà”. Codex sửa lại `resolveStudent()` trong `backend/lib/googleOAuth.js`: tạo student cho tài khoản mới, dùng lại tài khoản cũ và không tự đổi quyền của staff/admin.

Sau sửa, Codex báo 47 test đạt, build và lint thành công.

### Lỗi 2: Test quản lý phòng ban không chạy được

Test do Codex tạo chưa đọc `backend/.env`, nên kết nối sai địa chỉ MongoDB. Khi sửa kết nối, tên database thử nghiệm lại quá dài so với giới hạn của máy chủ đang dùng.

Tôi đã kết nối MongoDB Compass và yêu cầu chạy lại test. Codex tìm ra hai lỗi trên, bổ sung đọc `.env` và rút ngắn tên database thành `sq_dept_test_` kèm chuỗi ngẫu nhiên trong `backend/tests/adminDepartments.test.js`.

Kết quả được báo sau sửa là 3/3 test phòng ban và 59/59 test backend đạt.

### Trường hợp 3: Thông báo lỗi upload chưa rõ

Tôi upload file `.md` hợp lệ nhưng nhận thông báo chung chung rằng không thể cập nhật kiến thức. Thông báo này chưa giúp biết lỗi ở file, Gemini hay Chroma.

Sau khi tôi gửi file và lỗi, Codex xác định Chroma chưa chạy. Codex khởi động lại dịch vụ, nạp tài liệu thành công và sửa thông báo trong `backend/ai/knowledgeUpload.js` để chỉ rõ nhóm nguyên nhân. Việc Chroma chưa chạy là lỗi môi trường; phần code cần cải thiện là cách báo lỗi.


## 4. Hỗ trợ ngoài việc viết code

Tôi còn dùng Codex cho các việc sau:

- **Rà soát chức năng:** hỏi những phần còn thiếu theo từng role và mức độ ưu tiên.
- **Lên phương án AI usage:** hỏi cách thống kê request, token, chi phí, latency và lỗi. Cuộc chat này chỉ dừng ở tư vấn, chưa yêu cầu code.
- **Viết báo cáo:** soạn phần mở đầu, user story, acceptance criteria, bảng truy vết và ADR. Tôi yêu cầu sửa bảng truy vết để ghi đúng file test trong backend.
- **Chuẩn bị slide:** gợi ý nội dung tối đa 15 slide, giải thích RAG, structured output và phân quyền. Tôi yêu cầu tổng hợp các test đã có, không chạy lại hoặc coi số test case là số test đã pass.
- **Học code để vấn đáp:** yêu cầu giải thích từng module và chỉ rõ file, dòng code liên quan.
- **Viết tài liệu này:** tôi yêu cầu dùng lịch sử chat thật sau khi bản đầu suy diễn từ Git chưa đúng với quá trình tôi làm.

## 5. Ghi chú về phạm vi

Các nội dung trên lấy từ những cuộc chat như “Trạng thái Ticket”, “trạng thái appointment”, “Thêm sửa xóa phòng ban”, “Hoàn thiện quản lí người dùng admin”, “Tìm lỗi hiển thị OAuth trên web”, “Gợi ý tính năng frontend hiện đại”, “Mô tả tính năng tải tài liệu” và “Hướng dẫn deploy lên Vercel”.

Log ghi lại phần công việc có sử dụng Codex trong lịch sử đã đối chiếu. Với chatbot, phần được xác nhận ở đây là bổ sung streaming và upload vào chức năng đã có; tôi không gán toàn bộ RAG, structured output hay dashboard AI usage cho các cuộc chat này. Gemini là mô hình được ứng dụng gọi khi chạy, còn Codex là công cụ tôi dùng để hỗ trợ phát triển.
