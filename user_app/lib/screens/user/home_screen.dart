import 'dart:io';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:image_picker/image_picker.dart';

import '../../services/api_service.dart';
import 'my_bookings_screen.dart';
import 'login_screen.dart';
import 'booking_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  final List<Widget> _pages = [
    const MapPage(),
    const MyBookingsScreen(),
    const UserProfilePage(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _currentIndex, children: _pages),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        selectedItemColor: Colors.blueAccent,
        unselectedItemColor: Colors.grey,
        type: BottomNavigationBarType.fixed,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.map_outlined), label: "Map"),
          BottomNavigationBarItem(icon: Icon(Icons.assignment_outlined), label: "My Bookings"),
          BottomNavigationBarItem(icon: Icon(Icons.person_outline), label: "Profile"),
        ],
      ),
    );
  }
}

// ==========================================
// 🔵 UPDATED MAP PAGE (With Nearby Workers Markers)
// ==========================================
class MapPage extends StatefulWidget {
  const MapPage({super.key});
  @override
  State<MapPage> createState() => _MapPageState();
}

class _MapPageState extends State<MapPage> {
  // 🔥 Ye raha aapka marker variable
  Set<Marker> markers = {};
  dynamic selectedWorker;

  final List<String> categories = ["All", "Plumber", "Electrician", "Painter", "Cleaner", "Carpenter","Driver","Helper"];
  String selectedCategory = "All";

  @override
  void initState() {
    super.initState();
    loadWorkers(); // Initial load
  }

  // 🔥 UPDATED FUNCTION: Aapka purana loadWorkers + _loadNearbyWorkers merge kar diya
  void loadWorkers() async {
    final workers = await ApiService.getAllWorkers();
    Set<Marker> tempMarkers = {};

    for (var w in workers) {
      // Category filter logic (Waisa hi hai)
      if (selectedCategory != "All" && w['serviceType'] != selectedCategory) {
        continue;
      }

      if (w['latitude'] != null && w['longitude'] != null) {
        tempMarkers.add(Marker(
          markerId: MarkerId(w['_id']),
          position: LatLng(
              double.parse(w['latitude'].toString()),
              double.parse(w['longitude'].toString())
          ),
          // 🔥 Icon Orange kiya hai taaki user ko alag dikhe
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
          infoWindow: InfoWindow(title: w['name'] ?? "Worker", snippet: w['serviceType'] ?? "Service"),
          onTap: () {
            setState(() {
              selectedWorker = w;
            });
          },
        ));
      }
    }
    setState(() => markers = tempMarkers);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Smart Work System", style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: true,
        elevation: 0,
      ),
      body: Stack(
        children: [
          GoogleMap(
            initialCameraPosition: const CameraPosition(target: LatLng(26.8467, 80.9462), zoom: 12),
            markers: markers, // 🔥 Markers yahan se display ho rahe hain
            myLocationEnabled: true,
            onTap: (position) {
              setState(() {
                selectedWorker = null;
              });
            },
          ),

          // 🏷️ Category Chips (Unchanged)
          Positioned(
            top: 10, left: 0, right: 0,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Row(
                children: categories.map((cat) => Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 5),
                  child: ChoiceChip(
                    label: Text(cat),
                    selected: selectedCategory == cat,
                    selectedColor: Colors.blueAccent,
                    labelStyle: TextStyle(
                        color: selectedCategory == cat ? Colors.white : Colors.black,
                        fontWeight: FontWeight.bold
                    ),
                    onSelected: (selected) {
                      if (selected) {
                        setState(() {
                          selectedCategory = cat;
                          selectedWorker = null;
                        });
                        loadWorkers(); // Refresh on category change
                      }
                    },
                  ),
                )).toList(),
              ),
            ),
          ),

          // 👷 WORKER CARD (Unchanged)
          if (selectedWorker != null)
            Positioned(
              bottom: 20, left: 15, right: 15,
              child: Container(
                padding: const EdgeInsets.all(15),
                decoration: BoxDecoration(
                  color: Colors.lightBlueAccent,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 10, spreadRadius: 5)
                  ],
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 30,
                      backgroundColor: Colors.blue.shade50,
                      child: const Icon(Icons.person, size: 35, color: Colors.blueAccent),
                    ),
                    const SizedBox(width: 15),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            selectedWorker['name'] ?? "Unknown",
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                          Text(
                            selectedWorker['serviceType'] ?? "Worker",
                            style: const TextStyle(fontSize: 14, color: Colors.grey),
                          ),
                        ],
                      ),
                    ),
                    ElevatedButton(
                      onPressed: () => Navigator.push(
                        context,
                        MaterialPageRoute(builder: (context) => BookingScreen(workerData: selectedWorker)),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blueAccent,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: const Text("Book Now", style: TextStyle(color: Colors.white)),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ==========================================
// 👤 USER PROFILE PAGE (Unchanged)
// ==========================================
class UserProfilePage extends StatefulWidget {
  const UserProfilePage({super.key});
  @override
  State<UserProfilePage> createState() => _UserProfilePageState();
}

class _UserProfilePageState extends State<UserProfilePage> {
  String name = "Loading...", email = "Loading...", phone = "Not Provided";
  File? image;

  @override
  void initState() {
    super.initState();
    loadUserData();
  }

  void loadUserData() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      name = prefs.getString('name') ?? "Customer";
      email = prefs.getString('email') ?? "No Email";
      phone = prefs.getString('phone') ?? "Add Phone Number";
      String? path = prefs.getString('profile_path');
      if (path != null) image = File(path);
    });
  }

  void logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (context)=> const LoginScreen()), (r)=> false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(title: const Text("My Profile", style: TextStyle(fontWeight: FontWeight.bold)), centerTitle: true, elevation: 0, backgroundColor: Colors.white),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(25.0),
        child: Column(
          children: [
            const SizedBox(height: 20),
            Center(
              child: Stack(
                children: [
                  CircleAvatar(
                      radius: 65,
                      backgroundColor: Colors.blue.shade50,
                      backgroundImage: image != null ? FileImage(image!) : null,
                      child: image == null ? const Icon(Icons.person, size: 65, color: Colors.blueAccent) : null
                  ),
                  Positioned(
                    bottom: 0, right: 0,
                    child: CircleAvatar(
                      backgroundColor: Colors.blueAccent,
                      radius: 20,
                      child: IconButton(
                        icon: const Icon(Icons.camera_alt, size: 20, color: Colors.white),
                        onPressed: () async {
                          final picked = await ImagePicker().pickImage(source: ImageSource.gallery);
                          if(picked != null) {
                            final prefs = await SharedPreferences.getInstance();
                            await prefs.setString('profile_path', picked.path);
                            setState(() => image = File(picked.path));
                          }
                        },
                      ),
                    ),
                  )
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text(name, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
            Text(email, style: const TextStyle(fontSize: 16, color: Colors.grey)),
            const SizedBox(height: 30),
            const Divider(),
            _buildInfoCard(Icons.phone_android, "Phone Number", phone),
            _buildInfoCard(Icons.location_on_outlined, "Address", "Lucknow, Uttar Pradesh"),
            _buildInfoCard(Icons.verified_user_outlined, "Account Status", "Verified Customer"),
            const SizedBox(height: 30),
            SizedBox(
              width: double.infinity,
              height: 55,
              child: ElevatedButton(
                  onPressed: logout,
                  style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade50,
                      foregroundColor: Colors.red,
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15))
                  ),
                  child: const Text("LOGOUT ACCOUNT", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16))
              ),
            ),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoCard(IconData icon, String title, String value) {
    return Card(
      elevation: 0,
      color: Colors.grey.shade50,
      margin: const EdgeInsets.symmetric(vertical: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
      child: ListTile(
        leading: Icon(icon, color: Colors.blueAccent),
        title: Text(title, style: const TextStyle(fontSize: 14, color: Colors.grey)),
        subtitle: Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.black87)),
      ),
    );
  }
}