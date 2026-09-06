class StaffMember {
  final int? id;
  final String staffId;
  final String role;
  final String name;
  final String mobile;
  final String email;

  StaffMember({
    this.id,
    required this.staffId,
    required this.role,
    required this.name,
    required this.mobile,
    required this.email,
  });

  factory StaffMember.fromJson(Map<String, dynamic> json) {
    return StaffMember(
      id: json['id'] is int ? json['id'] : int.tryParse(json['id']?.toString() ?? ''),
      staffId: json['staff_id'] ?? json['staffId'] ?? '',
      role: json['role'] ?? 'doctor',
      name: json['name'] ?? '',
      mobile: json['mobile'] ?? '',
      email: json['email'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'staff_id': staffId,
      'role': role,
      'name': name,
      'mobile': mobile,
      'email': email,
    };
  }
}
