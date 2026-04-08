import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'user/home_screen.dart';
import 'worker/dashboard_screen.dart';
import 'selection_screen.dart';
import '../services/api_service.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(_controller);
    _controller.forward();

    _setupNotificationsAndLogin();
  }

  // 🔥 Is function ko purane wale se replace kar do (Line 40 ke aas paas)
  Future<void> _setupNotificationsAndLogin() async {
    try {
      final prefs = await SharedPreferences.getInstance();

      // 1. Firebase se naya Token lena
      String? token = await FirebaseMessaging.instance.getToken();

      if (token != null) {
        await prefs.setString('fcm_token', token);
        print("✅ Splash: FCM Token Generated: $token");

        // 2. Login info check karna
        bool isLoggedIn = prefs.getBool('is_logged_in') ?? false;
        String? userId = prefs.getString('userId');
        String? role = prefs.getString('role');

        // 🔍 DEBUG PRINTS (Terminal mein check karne ke liye)
        print("🔍 Debug: isLoggedIn=$isLoggedIn");
        print("🔍 Debug: userId=$userId");
        print("🔍 Debug: role=$role");

        if (isLoggedIn && userId != null && role != null) {
          print("📡 Syncing Token to Server now...");
          // 🔥 ASLI CALL: Token ko database mein update karna
          await ApiService.updateFCMTokenOnServer(userId, token, role);
          print("✅ Splash: Token synced successfully!");
        } else {
          print("⚠️ Token sync skip: User not logged in yet.");
        }
      }
    } catch (e) {
      print("❌ Firebase Token Error in Splash: $e");
    }

    // Design ke liye 3 second ka wait
    await Future.delayed(const Duration(seconds: 3));
    _checkLogin();
  }

  void _checkLogin() async {
    final prefs = await SharedPreferences.getInstance();
    final bool isLoggedIn = prefs.getBool('is_logged_in') ?? false;
    final String? role = prefs.getString('role');

    if (!mounted) return;

    if (isLoggedIn && role != null) {
      if (role == 'worker') {
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const DashboardScreen()));
      } else {
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const HomeScreen()));
      }
    } else {
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const SelectionScreen()));
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1A237E), Color(0xFF006064)],
          ),
        ),
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.1),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white24, width: 2),
                ),
                child: const Icon(Icons.bolt_rounded, size: 80, color: Colors.amberAccent),
              ),
              const SizedBox(height: 24),
              const Text(
                "SMART WORK",
                style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: 4),
              ),
              const Text(
                "Reliable • Fast • Professional",
                style: TextStyle(fontSize: 14, color: Colors.white70, letterSpacing: 1.2),
              ),
              const SizedBox(height: 60),
              const SizedBox(
                width: 40,
                height: 40,
                child: CircularProgressIndicator(
                  strokeWidth: 3,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.amberAccent),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}