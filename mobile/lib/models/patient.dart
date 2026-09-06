class Patient {
  final int id;
  final String name;
  final int? age;
  final String? gender;
  final String? bloodGroup;
  final double? weight;
  final String? mobile;
  final String? guardianContact;
  final String? roomNumber;
  final String? doctorName;
  final String? doctorSpecialization;
  final String? doctorPhone;
  final String? doctorEmail;
  final String? photo;

  Patient({
    required this.id,
    required this.name,
    this.age,
    this.gender,
    this.bloodGroup,
    this.weight,
    this.mobile,
    this.guardianContact,
    this.roomNumber,
    this.doctorName,
    this.doctorSpecialization,
    this.doctorPhone,
    this.doctorEmail,
    this.photo,
  });

  factory Patient.fromJson(Map<String, dynamic> json) {
    return Patient(
      id: json['id'] is int ? json['id'] : int.tryParse(json['id']?.toString() ?? '0') ?? 0,
      name: json['name'] ?? 'Unknown Patient',
      age: json['age'] is int ? json['age'] : int.tryParse(json['age']?.toString() ?? ''),
      gender: json['gender'],
      bloodGroup: json['blood_group'] ?? json['bloodGroup'],
      weight: json['weight'] != null ? double.tryParse(json['weight'].toString()) : null,
      mobile: json['mobile'],
      guardianContact: json['guardian_contact'] ?? json['guardianContact'],
      roomNumber: json['room_number']?.toString() ?? json['roomNumber']?.toString(),
      doctorName: json['doctor_name'] ?? json['doctorName'],
      doctorSpecialization: json['doctor_specialization'] ?? json['doctorSpecialization'],
      doctorPhone: json['doctor_phone'] ?? json['doctorPhone'],
      doctorEmail: json['doctor_email'] ?? json['doctorEmail'],
      photo: json['photo'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'age': age,
      'gender': gender,
      'blood_group': bloodGroup,
      'weight': weight,
      'mobile': mobile,
      'guardian_contact': guardianContact,
      'room_number': roomNumber,
      'doctor_name': doctorName,
      'doctor_specialization': doctorSpecialization,
      'doctor_phone': doctorPhone,
      'doctor_email': doctorEmail,
      'photo': photo,
    };
  }
}
