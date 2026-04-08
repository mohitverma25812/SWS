import 'package:flutter/material.dart';
// ✅ VIP Absolute Imports - Inka path aur class name dhyan se dekhna
import 'package:user_app/screens/user/login_screen.dart' as userPage;
import 'package:user_app/screens/worker/login_screen.dart' as workerPage;

class SelectionScreen extends StatelessWidget {
  const SelectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF1A237E), Color(0xFF006064)],
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text(
              "SMART WORK",
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 35,
                fontWeight: FontWeight.bold,
                color: Colors.white,
                letterSpacing: 2,
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              "What would you like to do?",
              style: TextStyle(fontSize: 18, color: Colors.white70, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 60),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                // 👤 Customer Circle
                _buildCircleOption(
                  context,
                  title: "Customer",
                  icon: Icons.person_search_rounded,
                  color: Colors.cyanAccent,
                  onTap: () {
                    Navigator.push(
                      context,
                      // 🔥 FIX: Yahan 'LoginScreen' check karna agar error aaye
                      MaterialPageRoute(builder: (context) => userPage.LoginScreen()),
                    );
                  },
                ),
                // 🛠️ Worker Circle
                _buildCircleOption(
                  context,
                  title: "Worker",
                  icon: Icons.engineering_rounded,
                  color: Colors.amberAccent,
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (context) => workerPage.WorkerLoginScreen()),
                    );
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCircleOption(BuildContext context, {required String title, required IconData icon, required Color color, required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            height: 120,
            width: 120,
            decoration: BoxDecoration(
              // ✅ FIX: Deprecated withOpacity ki jagah withValues use kiya
                color: color.withValues(alpha: 0.1),
                shape: BoxShape.circle,
                border: Border.all(color: color, width: 3),
                boxShadow: [
                  BoxShadow(
                    color: color.withValues(alpha: 0.3),
                    blurRadius: 15,
                    offset: const Offset(0, 8),
                  )
                ]
            ),
            child: Icon(icon, size: 60, color: color),
          ),
          const SizedBox(height: 15),
          Text(
            title,
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: color),
          ),
        ],
      ),
    );
  }
}