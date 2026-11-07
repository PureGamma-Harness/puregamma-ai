package ai.puregamma.android.data.remote

import ai.puregamma.android.data.remote.dto.EmailLoginRequest
import ai.puregamma.android.data.remote.dto.EmailRegisterRequest
import com.google.gson.Gson
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.HttpException
import retrofit2.converter.gson.GsonConverterFactory

class EmailRegistrationApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: PureGammaApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(PureGammaApi::class.java)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun registrationAcceptsPendingResponseWithoutCredentials() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(202).setBody(
                """{"verification_required":true,"email_sent":true,"message":"Verify your email"}""",
            ),
        )

        val response = api.emailRegister(EmailRegisterRequest("new@example.com", "Password123", "New", "en"))

        assertEquals(true, response.verificationRequired)
        assertEquals(true, response.emailSent)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/auth/mobile/email/register", request.path)
        val body = Gson().fromJson(request.body.readUtf8(), EmailRegisterRequest::class.java)
        assertEquals("new@example.com", body.email)
    }

    @Test
    fun unavailableEmailDeliveryRemainsPending() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(202).setBody(
                """{"verification_required":true,"email_sent":false}""",
            ),
        )

        val response = api.emailRegister(EmailRegisterRequest("new@example.com", "Password123", "New", "en"))

        assertTrue(response.verificationRequired == true)
        assertFalse(response.emailSent == true)
    }

    @Test
    fun emailDeliveryFailureDoesNotBecomeAPendingSuccess() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(503).setBody(
                """{"detail":{"code":"VERIFICATION_EMAIL_FAILED"}}""",
            ),
        )

        try {
            api.emailRegister(EmailRegisterRequest("new@example.com", "Password123", "New", "en"))
            fail("Expected the registration failure to propagate")
        } catch (error: HttpException) {
            assertEquals(503, error.code())
        }
    }

    @Test
    fun emailLoginStillParsesAnAuthenticatedResponse() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"access_token":"verified-token","user":{"id":"1","email":"new@example.com","name":"New","role":"user","plan":"Free","credit_balance":30}}""",
            ),
        )

        val response = api.emailLogin(EmailLoginRequest("new@example.com", "Password123"))

        assertEquals("verified-token", response.accessToken)
        assertEquals("new@example.com", response.user.email)
        assertEquals("/auth/mobile/email/login", server.takeRequest().path)
    }
}
