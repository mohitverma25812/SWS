import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../services/api_service.dart'; // ✅ Correct Service Path

import 'signup_screen.dart';
import 'dashboard_screen.dart'; // ✅ Dashboard par bhejne ke liye

class WorkerLoginScreen extends StatefulWidget {
  const WorkerLoginScreen({super.key});

  @override
  State<WorkerLoginScreen> createState() => _WorkerLoginScreenState();
}

class _WorkerLoginScreenState extends State<WorkerLoginScreen> {
  final TextEditingController emailController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();
  bool isLoading = false;
  File? _workerLoginImage;
  final ImagePicker _picker = ImagePicker();

  Future<void> _pickImage() async {
    try {
      final XFile? pickedFile = await _picker.pickImage(source: ImageSource.gallery);
      if (pickedFile != null) setState(() => _workerLoginImage = File(pickedFile.path));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
    }
  }

  Future<void> handleLogin() async {
    if (emailController.text.isEmpty || passwordController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("⚠️ Enter Email & Password")));
      return;
    }

    setState(() => isLoading = true);

    try {
      final result = await ApiService.loginWorker(
          emailController.text.trim(),
          passwordController.text.trim()
      );

      if (mounted) setState(() => isLoading = false);

      if (result['success']) {
        final prefs = await SharedPreferences.getInstance();
        final workerData = result['worker'];

        if (workerData != null) {
          // 🆔 ID saving fix
          final String myWorkerId = workerData['userId']?.toString() ?? workerData['_id']?.toString() ?? '';
          if (myWorkerId.isNotEmpty) await prefs.setString('workerId', myWorkerId);

          // 👤 Profile saving
          await prefs.setString('name', workerData['name'] ?? 'Worker');
          await prefs.setString('email', workerData['email'] ?? emailController.text.trim());
          await prefs.setString('serviceType', workerData['serviceType'] ?? 'Worker');
        }

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("✅ Welcome to Dashboard!")));
          Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const DashboardScreen()));
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("❌ ${result['message']}"), backgroundColor: Colors.red));
        }
      }
    } catch (e) {
      if (mounted) setState(() => isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
          title: const Text("Worker Login", style: TextStyle(color: Colors.white)),
          backgroundColor: Colors.blueAccent,
          iconTheme: const IconThemeData(color: Colors.white)
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(25.0),
          child: Column(
            children: [
              const SizedBox(height: 20),
              GestureDetector(
                onTap: _pickImage,
                child: CircleAvatar(
                  radius: 60,
                  backgroundColor: Colors.blue.shade50,
                  backgroundImage: _workerLoginImage != null ? FileImage(_workerLoginImage!) : null,
                  child: _workerLoginImage == null ? const Icon(Icons.engineering, size: 60, color: Colors.blueAccent) : null,
                ),
              ),
              const SizedBox(height: 20),
              const Text("Login to your Account", style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              const SizedBox(height: 40),
              TextField(
                  controller: emailController,
                  decoration: const InputDecoration(labelText: "Email", border: OutlineInputBorder(), prefixIcon: Icon(Icons.email))
              ),
              const SizedBox(height: 20),
              TextField(
                  controller: passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: "Password", border: OutlineInputBorder(), prefixIcon: Icon(Icons.lock))
              ),
              const SizedBox(height: 30),
              SizedBox(
                width: double.infinity,
                height: 55,
                child: ElevatedButton(
                  onPressed: isLoading ? null : handleLogin,
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  child: isLoading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text("LOGIN", style: TextStyle(fontSize: 18, color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(height: 20),
              TextButton(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (context) => const SignupScreen())),
                child: const Text("New Worker? Create Account", style: TextStyle(fontSize: 16)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}