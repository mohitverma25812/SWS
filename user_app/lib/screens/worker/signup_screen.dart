import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:user_app/services/api_service.dart';

// ✅ VIP Absolute Import
import 'package:user_app/screens/worker/login_screen.dart';

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final TextEditingController nameController = TextEditingController();
  final TextEditingController emailController = TextEditingController();
  final TextEditingController phoneController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();

  double? lat;
  double? lng;
  bool isLoadingLocation = false;
  bool isRegistering = false;

  String? selectedService;
  final List<String> serviceTypes = [
    'Electrician', 'Plumber', 'Driver', 'Carpenter', 'Painter', 'Mechanic', 'Helper'
  ];

  Future<void> getCurrentLocation() async {
    setState(() { isLoadingLocation = true; });

    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("⚠️ Please Enable GPS Location")));
        setState(() => isLoadingLocation = false);
        return;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("❌ Location Permission Denied")));
          setState(() => isLoadingLocation = false);
          return;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("❌ Permission Permanently Denied. Settings se allow karein.")));
        setState(() => isLoadingLocation = false);
        return;
      }

      Position position = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);

      setState(() {
        lat = position.latitude;
        lng = position.longitude;
        isLoadingLocation = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("✅ Location Found: $lat, $lng"), backgroundColor: Colors.green)
      );

    } catch (e) {
      setState(() => isLoadingLocation = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error fetching location: $e")));
    }
  }

  Future<void> registerWorker() async {
    if (nameController.text.isEmpty || emailController.text.isEmpty || passwordController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("⚠️ Please fill all fields")));
      return;
    }

    if (lat == null || lng == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("⚠️ Please click 'Get Location' first!"), backgroundColor: Colors.red)
      );
      return;
    }

    setState(() { isRegistering = true; });

    final result = await ApiService.registerWorker(
      name: nameController.text.trim(),
      email: emailController.text.trim(),
      phone: phoneController.text.trim(),
      password: passwordController.text.trim(),
      serviceType: selectedService ?? "Helper",
      lat: lat!,
      lng: lng!,
    );

    setState(() { isRegistering = false; });

    if (result['success']) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("✅ Account Created! Login Now."), backgroundColor: Colors.green)
      );
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => WorkerLoginScreen()));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("❌ ${result['message']}"), backgroundColor: Colors.red)
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Worker Registration"), backgroundColor: Colors.blue),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
        child: SingleChildScrollView(
          child: Column(
            children: [
              TextField(controller: nameController, decoration: const InputDecoration(labelText: "Full Name", border: OutlineInputBorder(), prefixIcon: Icon(Icons.person))),
              const SizedBox(height: 10),
              TextField(controller: emailController, decoration: const InputDecoration(labelText: "Email", border: OutlineInputBorder(), prefixIcon: Icon(Icons.email))),
              const SizedBox(height: 10),
              TextField(controller: phoneController, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: "Phone", border: OutlineInputBorder(), prefixIcon: Icon(Icons.phone))),
              const SizedBox(height: 10),
              TextField(controller: passwordController, obscureText: true, decoration: const InputDecoration(labelText: "Password", border: OutlineInputBorder(), prefixIcon: Icon(Icons.lock))),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: selectedService,
                hint: const Text("Select Service Type"),
                items: serviceTypes.map((String type) {
                  return DropdownMenuItem<String>(value: type, child: Text(type));
                }).toList(),
                onChanged: (newValue) { setState(() { selectedService = newValue; }); },
                decoration: const InputDecoration(border: OutlineInputBorder(), prefixIcon: Icon(Icons.work)),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: isLoadingLocation ? null : getCurrentLocation,
                  icon: Icon(lat == null ? Icons.location_on : Icons.check_circle),
                  label: Text(isLoadingLocation ? "Fetching..." : (lat == null ? "Get Location" : "Location Saved ✅")),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: lat != null ? Colors.green : Colors.orange,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
              if (lat != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8.0),
                  child: Text("Lat: $lat, Lng: $lng", style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: isRegistering ? null : registerWorker,
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.blue, padding: const EdgeInsets.symmetric(vertical: 15)),
                  child: isRegistering
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text("Register as Worker", style: TextStyle(fontSize: 18, color: Colors.white)),
                ),
              ),
              TextButton(
                onPressed: () { Navigator.push(context, MaterialPageRoute(builder: (context) => WorkerLoginScreen())); },
                child: const Text("Already have an account? Login"),
              )
            ],
          ),
        ),
      ),
    );
  }
}