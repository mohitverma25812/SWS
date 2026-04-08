import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../../services/api_service.dart';

class BookingScreen extends StatelessWidget {
  final Map<String, dynamic> workerData;

  const BookingScreen({super.key, required this.workerData});

  Future<Position?> _getUserLocation(BuildContext context) async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("⚠️ GPS Location Off hai, please ON karein!")));
      return null;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Location permission nahi mili!")));
        return null;
      }
    }
    return await Geolocator.getCurrentPosition();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Confirm Booking", style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.blueAccent,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Padding(
        padding: const EdgeInsets.all(25.0),
        child: Column(
          children: [
            const CircleAvatar(
              radius: 50,
              backgroundColor: Colors.blue,
              child: Icon(Icons.person, size: 50, color: Colors.white),
            ),
            const SizedBox(height: 15),
            Text(workerData['name'] ?? "Worker", style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            Text(workerData['serviceType'] ?? "Professional", style: const TextStyle(fontSize: 16, color: Colors.grey)),
            const Spacer(),
            Card(
              elevation: 4,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
              child: const ListTile(
                title: Text("Total Amount", style: TextStyle(fontWeight: FontWeight.bold)),
                trailing: Text("₹ 199", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Colors.green)),
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))
                ),
                onPressed: () async {
                  // 🕒 Loading Start
                  showDialog(
                      context: context,
                      barrierDismissible: false,
                      builder: (context) => const Center(child: CircularProgressIndicator())
                  );

                  Position? userPos = await _getUserLocation(context);
                  Navigator.pop(context); // Close loading dialog

                  if (userPos == null) return;

                  // 🚀 API Call Update: Ab lat/lng alag se ja rahe hain
                  bool success = await ApiService.createBooking(
                      workerData['_id'],
                      userPos.latitude,
                      userPos.longitude
                  );

                  if (success) {
                    ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text("✅ Booking Confirmed!"), backgroundColor: Colors.green)
                    );
                    Navigator.pop(context);
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text("❌ Booking Failed! Console check karein."), backgroundColor: Colors.red)
                    );
                  }
                },
                child: const Text("CONFIRM BOOKING", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}