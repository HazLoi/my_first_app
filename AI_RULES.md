# Quy tắc làm việc với AI

## 1. Ngôn ngữ

* Luôn trả lời và giải thích bằng tiếng Việt.
* Các thông báo, giải thích, hướng dẫn và kết quả xử lý phải bằng tiếng Việt.
* Có thể sử dụng tiếng Anh cho tên thư viện, tên class, tên biến, tên hàm, lệnh Terminal và cú pháp code khi cần thiết.
* Comment trong code nên viết bằng tiếng Việt nếu không có lý do đặc biệt để dùng tiếng Anh.

## 2. Nguyên tắc làm việc

* Đây là dự án Flutter.
* Luôn kiểm tra và hiểu code hiện tại trước khi thay đổi.
* Không được tự ý viết lại toàn bộ project.
* Chỉ sửa những file cần thiết cho yêu cầu hiện tại.
* Không xóa chức năng đang hoạt động nếu tôi không yêu cầu.
* Không tự ý thay đổi kiến trúc project.
* Không thêm package/dependency nếu không thực sự cần thiết.
* Ưu tiên giải pháp đơn giản, ổn định và dễ bảo trì.

## 3. Khi thực hiện yêu cầu

Trước khi sửa code:

1. Xác định các file liên quan.
2. Kiểm tra code hiện tại.
3. Xác định cách sửa ít ảnh hưởng nhất.
4. Thực hiện thay đổi.

Sau khi sửa:

1. Kiểm tra lỗi.
2. Chạy `flutter analyze`.
3. Nếu có lỗi thì tự sửa lỗi.
4. Chỉ báo hoàn thành khi code không còn lỗi nghiêm trọng.

## 4. Khi gặp lỗi

* Không được che giấu lỗi.
* Giải thích nguyên nhân lỗi bằng tiếng Việt.
* Đưa ra cách sửa cụ thể.
* Không tự ý xóa chức năng để tránh lỗi.
* Nếu không chắc chắn, hãy nói rõ điều chưa chắc chắn thay vì đoán.

## 5. Khi tôi yêu cầu thêm chức năng

* Giữ nguyên các chức năng đang có.
* Chỉ thêm chức năng được yêu cầu.
* Kiểm tra khả năng ảnh hưởng đến các chức năng cũ.
* Nếu chức năng mới cần thay đổi cấu trúc project, giải thích trước khi thực hiện.

## 6. Code

* Viết code rõ ràng, dễ đọc.
* Đặt tên class, function và variable có ý nghĩa.
* Tránh code dư thừa.
* Không tạo file hoặc class không cần thiết.
* Ưu tiên tái sử dụng code.
* Không sử dụng giải pháp phức tạp khi có giải pháp đơn giản hơn.

## 7. Giao tiếp

* Trả lời ngắn gọn, trực tiếp.
* Không giải thích dài dòng nếu tôi không yêu cầu.
* Khi hoàn thành một nhiệm vụ, hãy cho biết:

  * Đã thay đổi gì.
    * File nào đã thay đổi.
      * Kết quả kiểm tra.
        * Nếu còn việc cần tôi thực hiện thì ghi rõ.

        ## 8. Quan trọng

        * Không tự ý commit hoặc push code lên GitHub nếu tôi chưa yêu cầu.
        * Không tự ý xóa dữ liệu.
        * Không tự ý thay đổi cấu hình quan trọng.
        * Không tự ý cài thêm package hoặc công cụ lớn.
        * Khi một thao tác có thể gây mất dữ liệu hoặc ảnh hưởng lớn đến project, phải cảnh báo trước.
        