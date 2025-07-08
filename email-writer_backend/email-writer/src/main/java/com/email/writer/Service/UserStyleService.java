package com.email.writer.Service;


import com.email.writer.ExceptionHandling.SessionInvalidException;
import com.email.writer.Models.EmailRequest;
import com.email.writer.Repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserStyleService {

    @Autowired
    UserRepository userRepository;

    @Autowired
    RedisService redisService;

    @Transactional
    public void setUserStyle(EmailRequest emailRequest,String passcode){
        String userEmail = redisService.getEmail(passcode);
        if(userEmail==null){throw new SessionInvalidException("Please login");}


        userRepository.updateUserStyleByEmail(userEmail,emailRequest.getUserInput());

        redisService.saveStyle(userEmail,emailRequest.getUserInput());

    }

    }



