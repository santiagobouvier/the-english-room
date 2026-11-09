(function ($) {
    "use strict";

    // Initiate the wowjs
    new WOW().init();


    // Spinner
    var spinner = function () {
        setTimeout(function () {
            if ($('#spinner').length > 0) {
                $('#spinner').removeClass('show');
            }
        }, 1);
    };
    spinner();


    // Sticky Navbar
    $(window).scroll(function () {
        if ($(this).scrollTop() > 300) {
            $('.sticky-top').addClass('shadow-sm').css('top', '0px');
        } else {
            $('.sticky-top').removeClass('shadow-sm').css('top', '-100px');
        }
    });
    
    
    // Back to top button
    $(window).scroll(function () {
        if ($(this).scrollTop() > 300) {
            $('.back-to-top').fadeIn('slow');
        } else {
            $('.back-to-top').fadeOut('slow');
        }
    });
    $('.back-to-top').click(function () {
        $('html, body').animate({scrollTop: 0}, 1500, 'easeInOutExpo');
        return false;
    });


    // Header carousel
    $(".header-carousel").owlCarousel({
        autoplay: true,
        smartSpeed: 1500,
        items: 1,
        dots: true,
        loop: true,
        nav : true,
        navText : [
            '<i class="bi bi-chevron-left"></i>',
            '<i class="bi bi-chevron-right"></i>'
        ]
    });


    // Testimonials carousel
    $(".testimonial-carousel").owlCarousel({
        autoplay: true,
        smartSpeed: 1000,
        margin: 24,
        dots: false,
        loop: true,
        nav : true,
        navText : [
            '<i class="bi bi-arrow-left"></i>',
            '<i class="bi bi-arrow-right"></i>'
        ],
        responsive: {
            0:{
                items:1
            },
            992:{
                items:2
            }
        }
    });



    // modal función

     // Obtenemos el modal y el botón para cerrarlo
  var modal = document.getElementById("miModal");
  var btnCerrar = document.getElementsByClassName("cerrarModal")[0];

  // Abrimos el modal al hacer click o tocar el botón
  function abrirModal() {
    modal.style.display = "block";
    document.body.style.overflow = "hidden"; // Evitamos el scroll en la página de fondo
  }

  // Cerramos el modal al hacer click en la cruz o tocar fuera del modal en dispositivos móviles
  function cerrarModal() {
    modal.style.display = "none";
    document.body.style.overflow = "auto"; // Habilitamos el scroll en la página de fondo
  }

  // Cerramos el modal al tocar fuera de él en dispositivos móviles
  window.onclick = function(event) {
    if (event.target == modal) {
      cerrarModal();
    }
  };
    
})(jQuery);

