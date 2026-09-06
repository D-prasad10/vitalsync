class User {
  final String role;
  final String name;
  final String? staffId;
  final String? mobile;
  final String? email;

  User({
    required this.role,
    required this.name,
    this.staffId,
    this.mobile,
    this.email,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      role: json['role'] ?? 'patient',
      name: json['name'] ?? 'Healthcare User',
      staffId: json['staffId'] ?? json['staff_id'],
      mobile: json['mobile'],
      email: json['email'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'role': role,
      'name': name,
      'staffId': staffId,
      'mobile': mobile,
      'email': email,
    };
  }
}
