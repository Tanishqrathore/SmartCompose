package com.email.writer.Models;


import jakarta.persistence.*;
import lombok.*;
import jakarta.persistence.Id;



@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String googleId;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(unique = true)
    private String sessionKey;

    public User(String googleId, String email,String sessionKey) {
        this.googleId=googleId;
        this.email=email;
        this.sessionKey=sessionKey;
    }


}