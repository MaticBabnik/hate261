    for (i = get_bits_left(&s->gb); i > 24; i -= 1)
    {
        startcode = ((startcode << 1) | get_bits(&s->gb, 1)) & 0x000FFFFF;

        if (startcode == 0x10)
            break;
    }