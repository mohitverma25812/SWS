import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

class ApiService {
  // ✅ Render Live Links (Updated from Local IP to Cloud URL)
  static const String baseUrl = "https://sws-backend-zl39.onrender.com/api/auth";
  static const String bookingUrl = "https://sws-backend-zl39.onrender.com/api/bookings";

  // JWT Token getter
  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('jwt_token');
  }

  // 🔔 NOTIFICATION TOKEN SYNC
  static Future<void> updateFCMTokenOnServer(String userId, String token, String role) async {
    try {
      final jwtToken = await getToken();
      final response = await http.put(
        Uri.parse("$baseUrl/update-fcm-token/$userId"),
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer $jwtToken"
        },
        body: jsonEncode({
          "fcmToken": token,
          "role": role
        }),
      );

      if (response.statusCode == 200) {
        print("✅ FCM Token Synced with Server Successfully");
      } else {
        print("❌ Failed to Sync Token: ${response.body}");
      }
    } catch (e) {
      print("❌ FCM Sync Error: $e");
    }
  }

  // 🟢 LOGIN (Base Method)
  static Future<Map<String, dynamic>> login(String email, String password, [String role = 'user']) async {
    try {
      final response = await http.post(Uri.parse("$baseUrl/login"),
          headers: {"Content-Type": "application/json"},
          body: jsonEncode({"email": email, "password": password, "role": role}));

      final data = jsonDecode(response.body);
      if (response.statusCode == 200) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.clear();

        await prefs.setString('jwt_token', data['token'] ?? "");

        final userData = data['userData'] ?? {};
        String idToSave = (userData['userId'] ?? userData['_id'] ?? "").toString();

        await prefs.setString('userId', idToSave);
        await prefs.setString('name', userData['name']?.toString() ?? "User");
        await prefs.setString('email', userData['email']?.toString() ?? email);
        await prefs.setString('phone', userData['phone']?.toString() ?? "Not Provided");
        await prefs.setString('role', role);
        await prefs.setBool('is_logged_in', true);

        try {
          String? fcmToken = await FirebaseMessaging.instance.getToken();
          if (fcmToken != null) {
            await updateFCMTokenOnServer(idToSave, fcmToken, role);
            print("🚀 Login Sync: Token sent to server for ID: $idToSave");
          }
        } catch (e) {
          print("⚠️ FCM Token Fetch Error during login: $e");
        }

        print("✅ Login Success! ID: $idToSave");
        return {"success": true, "data": data};
      }
      return {"success": false, "message": data['message'] ?? "Login Failed"};
    } catch (e) {
      print("❌ Login Error: $e");
      return {"success": false};
    }
  }

  static Future<Map<String, dynamic>> loginWorker(String email, String password) async {
    return await login(email, password, 'worker');
  }

  // 🚀 CREATE BOOKING
  static Future<bool> createBooking(String workerId, double lat, double lng) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final String? userId = prefs.getString('userId');
      final String? token = prefs.getString('jwt_token');

      if (userId == null || userId.isEmpty) return false;

      final response = await http.post(
          Uri.parse("$bookingUrl/create"),
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer $token"
          },
          body: jsonEncode({
            "user": userId,
            "worker": workerId,
            "location": "User Live Location",
            "latitude": lat,
            "longitude": lng,
            "price": 199
          })
      );
      return response.statusCode == 201 || response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }

  static Future<List<dynamic>> getMyBookings() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final String? userId = prefs.getString('userId');
      final token = await getToken();
      final response = await http.get(Uri.parse("$bookingUrl/my-bookings/$userId"),
          headers: {"Authorization": "Bearer $token"});
      return response.statusCode == 200 ? jsonDecode(response.body) : [];
    } catch (e) { return []; }
  }

  static Future<List<dynamic>> getWorkerRequests() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final String? workerId = prefs.getString('userId');
      final token = await getToken();
      final response = await http.get(Uri.parse("$bookingUrl/worker-requests/$workerId"),
          headers: {"Authorization": "Bearer $token"});
      return response.statusCode == 200 ? jsonDecode(response.body) : [];
    } catch (e) { return []; }
  }

  static Future<bool> updateBookingStatus(String bookingId, String status) async {
    try {
      final token = await getToken();
      final response = await http.put(Uri.parse("$bookingUrl/update-status/$bookingId"),
          headers: {"Content-Type": "application/json", "Authorization": "Bearer $token"},
          body: jsonEncode({"status": status}));
      return response.statusCode == 200;
    } catch (e) { return false; }
  }

  static Future<bool> updateWorkerStatus(bool isOnline) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final String? workerId = prefs.getString('userId');
      final token = await getToken();
      final response = await http.put(Uri.parse("$baseUrl/update-availability/$workerId"),
          headers: {"Content-Type": "application/json", "Authorization": "Bearer $token"},
          body: jsonEncode({"isAvailable": isOnline}));
      return response.statusCode == 200;
    } catch (e) { return false; }
  }

  static Future<void> updateLiveLocation(double lat, double lng) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final String? workerId = prefs.getString('userId');
      final token = await getToken();
      await http.put(Uri.parse("$baseUrl/update-location/$workerId"),
          headers: {"Content-Type": "application/json", "Authorization": "Bearer $token"},
          body: jsonEncode({"latitude": lat, "longitude": lng}));
    } catch (e) { print("❌ Location Update Error: $e"); }
  }

  static Future<Map<String, dynamic>> registerUser(String name, String email, String password, String phone) async {
    try {
      final response = await http.post(Uri.parse("$baseUrl/register/user"),
          headers: {"Content-Type": "application/json"},
          body: jsonEncode({"name": name, "email": email, "password": password, "phone": phone}));
      final data = jsonDecode(response.body);
      return response.statusCode == 201 ? {"success": true, "message": data['message']} : {"success": false, "message": data['message']};
    } catch (e) { return {"success": false, "message": "Connection Error"}; }
  }

  static Future<Map<String, dynamic>> registerWorker({
    required String name,
    required String email,
    required String phone,
    required String password,
    required String serviceType,
    required double lat,
    required double lng
  }) async {
    try {
      final response = await http.post(Uri.parse("$baseUrl/register/worker"),
          headers: {"Content-Type": "application/json"},
          body: jsonEncode({
            "name": name,
            "email": email,
            "phone": phone,
            "password": password,
            "serviceType": serviceType,
            "role": "worker",
            "latitude": lat,
            "longitude": lng
          }));
      return response.statusCode == 201 ? {"success": true} : {"success": false};
    } catch (e) { return {"success": false}; }
  }

  static Future<List<dynamic>> getAllWorkers() async {
    try {
      final response = await http.get(Uri.parse("$baseUrl/workers"));
      return response.statusCode == 200 ? jsonDecode(response.body) : [];
    } catch (e) { return []; }
  }

  static Future<Map<String, dynamic>> submitRating({
    required String workerId,
    required String userId,
    required String bookingId,
    required double rating,
    required String comment,
  }) async {
    try {
      final token = await getToken();
      final response = await http.post(
        Uri.parse("$bookingUrl/rate-worker"),
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer $token"
        },
        body: jsonEncode({
          "workerId": workerId,
          "userId": userId,
          "bookingId": bookingId,
          "rating": rating,
          "comment": comment
        }),
      );

      final data = jsonDecode(response.body);
      if (response.statusCode == 200) {
        return {"success": true, "message": "Thank you for your feedback!"};
      } else {
        return {"success": false, "message": data['message'] ?? "Failed to submit rating"};
      }
    } catch (e) {
      return {"success": false, "message": "Connection Error"};
    }
  }

  // 🔥 1. VERIFY OTP (Tracking Screen ke liye)
  static Future<bool> verifyOTP(String bookingId, String otp) async {
    try {
      final token = await getToken();
      final response = await http.post(
        Uri.parse('$bookingUrl/verify-otp'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token'
        },
        body: jsonEncode({
          'bookingId': bookingId,
          'otp': otp,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['success'] == true;
      }
      return false;
    } catch (e) {
      print("Verify OTP Error: $e");
      return false;
    }
  }

  // 💰 2. GET WORKER EARNINGS (Profile Tab ke liye)
  static Future<Map<String, dynamic>> getWorkerEarnings(String workerId) async {
    try {
      final token = await getToken();
      final response = await http.get(
        Uri.parse('$bookingUrl/worker-earnings/$workerId'),
        headers: {'Authorization': 'Bearer $token'},
      );

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
      return {'totalEarnings': 0, 'totalJobs': 0};
    } catch (e) {
      print("Earnings Fetch Error: $e");
      return {'totalEarnings': 0, 'totalJobs': 0};
    }
  }
}