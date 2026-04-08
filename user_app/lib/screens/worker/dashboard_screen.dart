// ignore_for_file: deprecated_member_use
import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

import '../../services/api_service.dart';
import '../selection_screen.dart';
import 'tracking_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _currentIndex = 1;
  double currentLat = 26.8467;
  double currentLng = 80.9462;

  void _onLocationUpdated(double lat, double lng) {
    currentLat = lat;
    currentLng = lng;
  }

  @override
  Widget build(BuildContext context) {
    final List<Widget> tabs = [
      _WorkerMapTab(onLocationUpdate: _onLocationUpdated),
      _WorkerJobsTab(workerLat: currentLat, workerLng: currentLng),
      const _WorkerProfileTab(),
    ];

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: tabs,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        selectedItemColor: Colors.blueAccent,
        unselectedItemColor: Colors.grey,
        type: BottomNavigationBarType.fixed,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.map_rounded), label: "Live Map"),
          BottomNavigationBarItem(icon: Icon(Icons.work_rounded), label: "Jobs"),
          BottomNavigationBarItem(icon: Icon(Icons.person_rounded), label: "Profile"),
        ],
      ),
    );
  }
}

// ==========================================
// 🔵 TAB 1: WORKER MAP (Unchanged)
// ==========================================
class _WorkerMapTab extends StatefulWidget {
  final Function(double, double) onLocationUpdate;
  const _WorkerMapTab({required this.onLocationUpdate});

  @override
  State<_WorkerMapTab> createState() => __WorkerMapTabState();
}

class __WorkerMapTabState extends State<_WorkerMapTab> {
  final Completer<GoogleMapController> _mapController = Completer();
  bool isOnline = true;
  double lat = 26.8467, lng = 80.9462;
  bool isLocationLoading = true;

  @override
  void initState() {
    super.initState();
    _checkPermissionsAndGetLocation();
  }

  Future<void> _checkPermissionsAndGetLocation() async {
    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
      _startTracking();
    }
  }

  void _startTracking() async {
    try {
      Position initialPos = await Geolocator.getCurrentPosition();
      if (mounted) {
        setState(() {
          lat = initialPos.latitude;
          lng = initialPos.longitude;
          isLocationLoading = false;
        });
        widget.onLocationUpdate(lat, lng);
      }
      final controller = await _mapController.future;
      controller.animateCamera(CameraUpdate.newLatLngZoom(LatLng(lat, lng), 15));
    } catch (e) {
      if (mounted) setState(() => isLocationLoading = false);
    }

    Geolocator.getPositionStream().listen((pos) {
      if (isOnline) {
        ApiService.updateLiveLocation(pos.latitude, pos.longitude);
        widget.onLocationUpdate(pos.latitude, pos.longitude);
        if (mounted) setState(() { lat = pos.latitude; lng = pos.longitude; });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
          title: const Text("Tracking Dashboard", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          backgroundColor: Colors.blueAccent,
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 8.0),
              child: Row(
                children: [
                  Text(isOnline ? "Online " : "Offline ", style: const TextStyle(fontSize: 12, color: Colors.white)),
                  Switch(
                    value: isOnline,
                    activeTrackColor: Colors.greenAccent.withOpacity(0.5),
                    activeThumbColor: Colors.greenAccent,
                    onChanged: (val) {
                      setState(() => isOnline = val);
                      ApiService.updateWorkerStatus(val);
                    },
                  ),
                ],
              ),
            )
          ]
      ),
      body: isLocationLoading ? const Center(child: CircularProgressIndicator()) : GoogleMap(
        initialCameraPosition: CameraPosition(target: LatLng(lat, lng), zoom: 15),
        myLocationEnabled: true,
        onMapCreated: (c) => _mapController.complete(c),
      ),
    );
  }
}

// ==========================================
// 🔵 TAB 2: WORKER JOBS (Unchanged)
// ==========================================
class _WorkerJobsTab extends StatefulWidget {
  final double workerLat;
  final double workerLng;
  const _WorkerJobsTab({required this.workerLat, required this.workerLng});

  @override
  State<_WorkerJobsTab> createState() => __WorkerJobsTabState();
}

class __WorkerJobsTabState extends State<_WorkerJobsTab> {
  List<dynamic> jobs = [];
  bool isLoadingJobs = true;

  @override
  void initState() {
    super.initState();
    _loadJobs();
  }

  void _loadJobs() async {
    if (!mounted) return;
    setState(() => isLoadingJobs = true);
    final data = await ApiService.getWorkerRequests();
    if (mounted) setState(() { jobs = data; isLoadingJobs = false; });
  }

  void _handleCompleteWork(String bookingId) async {
    bool ok = await ApiService.updateBookingStatus(bookingId, "completed");
    if (ok) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Work Marked as Completed! ✅")));
        _loadJobs();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Job Requests", style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.blueAccent,
        actions: [IconButton(onPressed: _loadJobs, icon: const Icon(Icons.refresh, color: Colors.white))],
      ),
      body: isLoadingJobs ? const Center(child: CircularProgressIndicator()) : jobs.isEmpty
          ? const Center(child: Text("No Job Requests Received Yet"))
          : ListView.builder(
        itemCount: jobs.length,
        itemBuilder: (context, i) {
          final job = jobs[i];
          final String status = (job['status'] ?? 'pending').toString().toLowerCase();

          return Card(
            margin: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
            child: Column(
              children: [
                ListTile(
                  leading: const CircleAvatar(backgroundColor: Colors.blueAccent, child: Icon(Icons.person, color: Colors.white)),
                  title: Text("Customer: ${job['user']?['name'] ?? 'Unknown'}", style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text("Status: ${status.toUpperCase()}"),
                ),
                Padding(
                  padding: const EdgeInsets.all(8.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      if (status == 'pending') ...[
                        TextButton(
                          onPressed: () async {
                            await ApiService.updateBookingStatus(job['_id'], "rejected");
                            _loadJobs();
                          },
                          child: const Text("Reject", style: TextStyle(color: Colors.red)),
                        ),
                        const SizedBox(width: 10),
                        ElevatedButton(
                          onPressed: () async {
                            bool ok = await ApiService.updateBookingStatus(job['_id'], "accepted");
                            if (ok) {
                              if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Job Accepted!")));
                              await Navigator.push(
                                context,
                                MaterialPageRoute(builder: (context) => TrackingScreen(
                                  bookingId: job['_id'],
                                  workerLat: widget.workerLat,
                                  workerLng: widget.workerLng,
                                  userLat: (job['latitude'] is String) ? double.parse(job['latitude']) : (job['latitude']?.toDouble() ?? 26.8500),
                                  userLng: (job['longitude'] is String) ? double.parse(job['longitude']) : (job['longitude']?.toDouble() ?? 80.9500),
                                  userName: job['user']?['name'] ?? "Customer",
                                  userPhone: job['user']?['phone'] ?? "0000000000",
                                )),
                              );
                              _loadJobs();
                            }
                          },
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
                          child: const Text("Accept", style: TextStyle(color: Colors.white)),
                        ),
                      ],

                      if (status == 'accepted') ...[
                        ElevatedButton.icon(
                          onPressed: () async {
                            await Navigator.push(
                              context,
                              MaterialPageRoute(builder: (context) => TrackingScreen(
                                bookingId: job['_id'],
                                workerLat: widget.workerLat,
                                workerLng: widget.workerLng,
                                userLat: (job['latitude'] is String) ? double.parse(job['latitude']) : (job['latitude']?.toDouble() ?? 26.8500),
                                userLng: (job['longitude'] is String) ? double.parse(job['longitude']) : (job['longitude']?.toDouble() ?? 80.9500),
                                userName: job['user']?['name'] ?? "Customer",
                                userPhone: job['user']?['phone'] ?? "0000000000",
                              )),
                            );
                            _loadJobs();
                          },
                          icon: const Icon(Icons.navigation, color: Colors.white, size: 18),
                          label: const Text("Track", style: TextStyle(color: Colors.white)),
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent),
                        ),
                        const SizedBox(width: 8),
                        ElevatedButton(
                          onPressed: () => _handleCompleteWork(job['_id']),
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
                          child: const Text("COMPLETE", style: TextStyle(color: Colors.white)),
                        ),
                      ],

                      if (status == 'completed')
                        const Padding(
                          padding: EdgeInsets.only(right: 8.0),
                          child: Text("FINISHED 🏁", style: TextStyle(color: Colors.grey, fontWeight: FontWeight.bold)),
                        ),
                    ],
                  ),
                )
              ],
            ),
          );
        },
      ),
    );
  }
}

// ==========================================
// 🔴 TAB 3: PROFILE (With Live Rating & Earnings)
// ==========================================
class _WorkerProfileTab extends StatefulWidget {
  const _WorkerProfileTab();
  @override
  State<_WorkerProfileTab> createState() => __WorkerProfileTabState();
}

class __WorkerProfileTabState extends State<_WorkerProfileTab> {
  String workerName = "Loading...";
  String workerEmail = "Loading...";
  String workerPhone = "Loading...";
  String serviceType = "Worker";
  double averageRating = 0.0;
  int totalRatings = 0;
  int totalEarnings = 0; // 🔥 Naya Field
  File? _image;
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadWorkerProfile();
  }

  // 🚀 Fresh data fetch from API (Rating + Earnings)
  Future<void> _fetchWorkerStats(String workerId) async {
    try {
      // 1. Fetch Profile/Rating
      final profileRes = await http.get(Uri.parse("http://10.63.139.153:5000/api/auth/worker/$workerId"));
      // 2. Fetch Earnings
      final earningsRes = await http.get(Uri.parse("http://10.63.139.153:5000/api/bookings/worker-earnings/$workerId"));

      if (mounted) {
        setState(() {
          if (profileRes.statusCode == 200) {
            final pData = jsonDecode(profileRes.body);
            averageRating = (pData['averageRating'] ?? 0.0).toDouble();
            totalRatings = pData['totalRatings'] ?? 0;
          }
          if (earningsRes.statusCode == 200) {
            final eData = jsonDecode(earningsRes.body);
            totalEarnings = eData['totalEarnings'] ?? 0;
          }
          isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => isLoading = false);
      print("Stats Fetch Error: $e");
    }
  }

  void _loadWorkerProfile() async {
    final prefs = await SharedPreferences.getInstance();
    String? id = prefs.getString('userId');

    setState(() {
      workerName = prefs.getString('name') ?? "Worker";
      workerEmail = prefs.getString('email') ?? "No Email";
      workerPhone = prefs.getString('phone') ?? "Add Phone Number";
      serviceType = prefs.getString('serviceType') ?? "Professional";
      String? savedImagePath = prefs.getString('profile_image');
      if (savedImagePath != null) _image = File(savedImagePath);
    });

    if (id != null) _fetchWorkerStats(id);
  }

  void _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    if (mounted) {
      Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (context) => const SelectionScreen()), (route) => false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text("My Profile", style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.blueAccent,
        actions: [IconButton(onPressed: _loadWorkerProfile, icon: const Icon(Icons.refresh, color: Colors.white))],
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
        padding: const EdgeInsets.all(25.0),
        child: Column(
          children: [
            Center(
              child: Stack(
                alignment: Alignment.bottomRight,
                children: [
                  CircleAvatar(
                    radius: 70,
                    backgroundColor: Colors.blue.shade50,
                    backgroundImage: _image != null ? FileImage(_image!) : null,
                    child: _image == null ? const Icon(Icons.person, size: 70, color: Colors.blueAccent) : null,
                  ),
                  CircleAvatar(
                    backgroundColor: Colors.blueAccent,
                    radius: 20,
                    child: IconButton(
                      icon: const Icon(Icons.camera_alt, size: 20, color: Colors.white),
                      onPressed: () async {
                        final picked = await ImagePicker().pickImage(source: ImageSource.gallery);
                        if (picked != null) {
                          final prefs = await SharedPreferences.getInstance();
                          await prefs.setString('profile_image', picked.path);
                          setState(() => _image = File(picked.path));
                        }
                      },
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text(workerName, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),

            // ⭐ RATING SECTION
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.star, color: Colors.amber, size: 22),
                const SizedBox(width: 5),
                Text(
                  averageRating.toStringAsFixed(1),
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                Text(" ($totalRatings reviews)", style: const TextStyle(color: Colors.grey)),
              ],
            ),

            const Divider(height: 40),

            // 💰 EARNINGS CARD
            _buildInfoCard(Icons.account_balance_wallet, "Total Earnings", "₹$totalEarnings"),

            _buildInfoCard(Icons.phone_iphone_rounded, "Phone Number", workerPhone),
            _buildInfoCard(Icons.handyman_outlined, "Service Provided", serviceType),
            _buildInfoCard(Icons.reviews, "Feedback Status", "Aapka kaam ${averageRating.toStringAsFixed(1)} stars hai!"),

            const SizedBox(height: 30),
            SizedBox(
              width: double.infinity,
              height: 55,
              child: ElevatedButton(
                onPressed: _logout,
                style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15))),
                child: const Text("LOGOUT", style: TextStyle(fontSize: 18, color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoCard(IconData icon, String title, String value) {
    return Card(
      elevation: 0,
      color: Colors.grey.shade100,
      margin: const EdgeInsets.symmetric(vertical: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
      child: ListTile(
        leading: Icon(icon, color: Colors.blueAccent),
        title: Text(title, style: const TextStyle(fontSize: 13, color: Colors.grey)),
        subtitle: Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
      ),
    );
  }
}