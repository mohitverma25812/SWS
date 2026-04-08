import 'package:flutter/material.dart';
import 'package:user_app/services/api_service.dart';

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  // ... (Controller variables)
  final TextEditingController nameController = TextEditingController();
  final TextEditingController emailController = TextEditingController();
  final TextEditingController passController = TextEditingController();
  final TextEditingController phoneController = TextEditingController();
  bool isLoading = false;

  void register() async {
    // ... (Register Logic)
    setState(() { isLoading = true; });
    final response = await ApiService.registerUser(
      nameController.text, emailController.text, passController.text, phoneController.text,
    );
    if (!mounted) return;
    setState(() { isLoading = false; });

    if (response['success']) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Success: ${response['message']}")));
      Navigator.pop(context); // Wapas Login par bhejo
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: ${response['message']}")));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("User Sign Up")),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          children: [
            TextField(controller: nameController, decoration: const InputDecoration(labelText: "Name")),
            TextField(controller: emailController, decoration: const InputDecoration(labelText: "Email")),
            TextField(controller: passController, decoration: const InputDecoration(labelText: "Password"), obscureText: true),
            TextField(controller: phoneController, decoration: const InputDecoration(labelText: "Phone")),
            const SizedBox(height: 20),
            isLoading ? const CircularProgressIndicator() : ElevatedButton(onPressed: register, child: const Text("Register")),
          ],
        ),
      ),
    );
  }
}